/**
 * Monday.com client.
 *
 * Server-side only. The API token can write to every board on the account,
 * so it never reaches the browser: the intake form posts to
 * /api/monday/brief and this module does the talking.
 *
 * Two rules shape everything below.
 *
 * The first is that nothing here may change the shape of the board. This
 * app creates items and attaches a file to the item it just created. It
 * does not create, rename or delete columns, groups or labels, and it does
 * not touch existing items. A board is a shared workspace, and an
 * integration that quietly invents a column or a dropdown label to make its
 * own write succeed has damaged something a person set up on purpose. So
 * when a column, group or label is missing, the write drops that one field
 * and says what was missing, and a human adds it in Monday if they want it.
 *
 * The second is that column IDs are never hardcoded. Monday keys column
 * values by opaque ID (`text_mkr1`, `date4`), and those IDs change when a
 * board is rebuilt. Titles are what a human knows and what survives a
 * restructure, so the board's own schema is read and matched by title.
 */

const API = 'https://api.monday.com/v2';
/* File uploads go to a different endpoint. The main one rejects them. */
const FILE_API = 'https://api.monday.com/v2/file';
const API_VERSION = '2024-10';

/* The schema is cached per server instance so a save is one round trip
 * rather than two. It expires rather than living forever: adding the
 * missing column in Monday should start working within a few minutes,
 * without anyone having to redeploy to clear a cache. */
const SCHEMA_TTL_MS = 5 * 60 * 1000;

export function mondayConfig() {
  return {
    token: process.env.MONDAY_API_TOKEN || '',
    boardId: process.env.MONDAY_BOARD_ID || '',
  };
}

export function isConfigured() {
  const { token, boardId } = mondayConfig();
  return Boolean(token && boardId);
}

/**
 * Titles are compared with case and punctuation thrown away, so "Campaign
 * objective", "Campaign Objective" and "Campaign  objective:" are one
 * column. Anything that is not a letter or a digit becomes a single space.
 */
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function query(gql, variables = {}) {
  const { token } = mondayConfig();
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      'API-Version': API_VERSION,
    },
    body: JSON.stringify({ query: gql, variables }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Monday returned ${res.status}: ${body?.error_message || res.statusText}`);
  }
  /* GraphQL reports failures with a 200 and an errors array, so checking
   * the status alone would treat a rejected write as a success. */
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }
  return body.data;
}

/* ------------------------------------------------------------------ *
 * Board discovery
 * ------------------------------------------------------------------ */

let cache = null;

/** Drops the cached schema. Exported for tests and for a forced refresh. */
export function clearSchemaCache() {
  cache = null;
}

/**
 * Pulls the labels out of a dropdown or status column's settings.
 *
 * Monday has shipped both shapes over the years: an array of `{id, name}`
 * for dropdowns and an id-keyed object for statuses. Both are handled,
 * because guessing wrong here would mean deciding a perfectly good label
 * does not exist and silently dropping the field.
 */
export function labelsOf(settingsStr) {
  let settings;
  try {
    settings = JSON.parse(settingsStr || '{}');
  } catch {
    return [];
  }
  const raw = settings?.labels;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
}

const BOARD_QUERY = (withUrl) => `
  query ($ids: [ID!]) {
    boards (ids: $ids) {
      id
      name
      ${withUrl ? 'url' : ''}
      columns { id title type settings_str }
      groups { id title }
    }
  }
`;

/**
 * Reads the board's columns and groups, cached per instance.
 *
 * Only ever the one board named by MONDAY_BOARD_ID. Nothing in this module
 * takes a board argument, so there is no path by which a request could
 * point the write at somebody else's board.
 */
export async function boardSchema({ refresh = false } = {}) {
  const { boardId } = mondayConfig();
  if (!boardId) throw new Error('MONDAY_BOARD_ID is not set.');

  const fresh = cache && cache.boardId === boardId && Date.now() - cache.at < SCHEMA_TTL_MS;
  if (fresh && !refresh) return cache.schema;

  let data;
  try {
    data = await query(BOARD_QUERY(true), { ids: [String(boardId)] });
  } catch (err) {
    /* `url` is the one field here that has moved between API versions. If
     * it is not available, the rest of the schema still is, and a board
     * link can be assembled by hand. Losing discovery over a convenience
     * field would be the wrong trade. */
    if (!/url/i.test(err.message)) throw err;
    data = await query(BOARD_QUERY(false), { ids: [String(boardId)] });
  }

  const board = data?.boards?.[0];
  if (!board) {
    throw new Error(
      `Board ${boardId} was not found, or this API token cannot see it. Check MONDAY_BOARD_ID against the number in the board's URL.`
    );
  }

  const columns = (board.columns || []).map((c) => ({
    id: c.id,
    title: c.title,
    type: c.type,
    labels: labelsOf(c.settings_str),
  }));
  const groups = (board.groups || []).map((g) => ({ id: g.id, title: g.title }));

  const schema = {
    boardId: String(board.id),
    boardName: board.name,
    boardUrl: board.url || `https://view.monday.com/boards/${board.id}`,
    columns,
    groups,
    columnByTitle: new Map(columns.map((c) => [norm(c.title), c])),
    groupByTitle: new Map(groups.map((g) => [norm(g.title), g])),
  };

  cache = { boardId, at: Date.now(), schema };
  return schema;
}

/* ------------------------------------------------------------------ *
 * Turning a value into what Monday wants
 * ------------------------------------------------------------------ */

/**
 * Formats one value for one column.
 *
 * Returns `{ ok: true, value }`, or `{ ok: false, reason }` when the value
 * cannot be written without changing the board. A reason is always a
 * sentence a person can act on, because it ends up in front of one.
 */
export function formatValue(col, value) {
  switch (col.type) {
    case 'numbers': {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, reason: `"${value}" is not a number` };
      return { ok: true, value: String(n) };
    }

    case 'date': {
      const date = String(value).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { ok: false, reason: `"${value}" is not a YYYY-MM-DD date` };
      }
      return { ok: true, value: { date } };
    }

    case 'dropdown':
    case 'status': {
      const wanted = (Array.isArray(value) ? value : String(value).split(','))
        .map((v) => String(v).trim())
        .filter(Boolean);

      /* A board with no labels configured yet, or a settings blob this
       * code could not read. Sending a label blind would risk creating
       * one, so the field is dropped instead. */
      if (!col.labels.length) {
        return { ok: false, reason: `the board's "${col.title}" column has no labels set up yet` };
      }

      const matched = [];
      const unknown = [];
      for (const w of wanted) {
        const hit = col.labels.find((l) => norm(l) === norm(w));
        if (hit) matched.push(hit);
        else unknown.push(w);
      }

      if (!matched.length) {
        return {
          ok: false,
          reason: `"${col.title}" has no label called ${quoteList(unknown)}. Add it in Monday: this app does not create labels.`,
        };
      }

      /* Some labels landed and some did not. The write goes ahead with
       * what exists and names what did not, which beats dropping a whole
       * objective list because one entry was renamed on the board. */
      const note = unknown.length
        ? `"${col.title}" has no label called ${quoteList(unknown)}, so ${unknown.length === 1 ? 'it was' : 'those were'} left off.`
        : null;

      /* A status column holds one label; a dropdown holds several. */
      return col.type === 'status'
        ? { ok: true, value: { label: matched[0] }, note }
        : { ok: true, value: { labels: matched }, note };
    }

    case 'email':
      return { ok: true, value: { email: String(value), text: String(value) } };

    case 'link':
      return { ok: true, value: { url: String(value), text: String(value) } };

    case 'long_text':
      return { ok: true, value: { text: String(value) } };

    default:
      return { ok: true, value: String(value) };
  }
}

const quoteList = (xs) => xs.map((x) => `"${x}"`).join(' or ');

/* ------------------------------------------------------------------ *
 * Creating the item
 * ------------------------------------------------------------------ */

/**
 * Creates one item on the configured board.
 *
 * `fields` is keyed by human column title. `groupTitle` is matched against
 * the board's group titles; when nothing matches, the item is created with
 * no group rather than guessed into one. That is the whole of bug one: a
 * Marken brief landed in the PCI group because no group was named at all,
 * so Monday dropped it into whichever group happens to sit at the top.
 *
 * Nothing here is fatal except the create itself. A missing column, a
 * missing label or a missing group each cost that one field and produce a
 * note, because a brief on the board minus its launch date is worth far
 * more than no brief at all.
 */
export async function createBriefItem({ itemName, groupTitle, fields }) {
  const cfg = mondayConfig();
  if (!cfg.token || !cfg.boardId) {
    throw new Error('Monday is not configured. Set MONDAY_API_TOKEN and MONDAY_BOARD_ID.');
  }
  if (!String(itemName || '').trim()) {
    throw new Error('An item needs a name.');
  }

  const schema = await boardSchema();
  const values = {};
  const unmapped = [];
  const notes = [];

  for (const [title, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;

    const col = schema.columnByTitle.get(norm(title));
    if (!col) {
      unmapped.push({ field: title, reason: 'no column with that title on the board' });
      continue;
    }

    const formatted = formatValue(col, value);
    if (!formatted.ok) {
      unmapped.push({ field: title, reason: formatted.reason });
      continue;
    }
    if (formatted.note) notes.push(formatted.note);
    values[col.id] = formatted.value;
  }

  /* The group is chosen by title, never by position. */
  const group = groupTitle ? schema.groupByTitle.get(norm(groupTitle)) : null;
  if (groupTitle && !group) {
    notes.push(
      `The board has no group called "${groupTitle}", so the item was created without one. Add that group in Monday and the next brief will land in it.`
    );
  }

  /* Deliberately no create_labels_if_missing. Its whole purpose is to
   * change the board when a label does not fit, which is the one thing
   * this integration must never do. Unknown labels were dropped above. */
  const data = await query(
    `mutation ($board: ID!, $group: String, $name: String!, $values: JSON!) {
       create_item (
         board_id: $board,
         group_id: $group,
         item_name: $name,
         column_values: $values
       ) { id name }
     }`,
    {
      board: String(cfg.boardId),
      group: group?.id || null,
      name: String(itemName),
      values: JSON.stringify(values),
    }
  );

  const id = data?.create_item?.id;
  if (!id) throw new Error('Monday accepted the request but returned no item.');

  return {
    id: String(id),
    name: data.create_item.name,
    url: `${schema.boardUrl}/pulses/${id}`,
    group: group?.title || null,
    written: Object.keys(values).length,
    unmapped,
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * Attaching the PDF
 * ------------------------------------------------------------------ */

/** Column IDs Monday hands out, and the only shape that is inlined below. */
const SAFE_COLUMN_ID = /^[A-Za-z0-9_]+$/;
const SAFE_ITEM_ID = /^\d+$/;

/**
 * Finds the file column by title. Returns null when the board has none,
 * which is a reason to skip the upload, never to create the column.
 */
export function fileColumn(schema, title) {
  const col = schema.columnByTitle.get(norm(title));
  if (!col) return null;
  return col.type === 'file' ? col : null;
}

/**
 * Uploads one file to a file column on an item that was just created.
 *
 * Monday's file endpoint follows the GraphQL multipart spec: the mutation
 * goes in a `query` part, `map` points a named file part at the `$file`
 * variable, and the bytes follow. The item and column IDs are interpolated
 * into the mutation because that is the shape Monday documents, so both are
 * checked against a strict pattern first. The item ID comes from Monday's
 * own create response and the column ID from the board schema, so neither
 * is user input, but a write to somebody's board is not the place to rely
 * on that staying true.
 */
export async function attachFile({ itemId, columnId, file, filename = 'brief.pdf' }) {
  const { token } = mondayConfig();
  if (!SAFE_ITEM_ID.test(String(itemId))) throw new Error(`Refusing to upload against item "${itemId}".`);
  if (!SAFE_COLUMN_ID.test(String(columnId))) throw new Error(`Refusing to upload to column "${columnId}".`);

  const form = new FormData();
  form.append(
    'query',
    `mutation ($file: File!) {
       add_file_to_column (item_id: ${itemId}, column_id: "${columnId}", file: $file) { id }
     }`
  );
  form.append('map', JSON.stringify({ brief_pdf: 'variables.file' }));
  form.append('brief_pdf', file, filename);

  /* No Content-Type header: fetch has to set it, because only it knows the
   * multipart boundary it generated. */
  const res = await fetch(FILE_API, {
    method: 'POST',
    headers: { Authorization: token, 'API-Version': API_VERSION },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Monday returned ${res.status}: ${body?.error_message || res.statusText}`);
  }
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }
  return { id: body?.data?.add_file_to_column?.id || null };
}

/* ------------------------------------------------------------------ *
 * The brief, as columns
 * ------------------------------------------------------------------ */

/** The file column the brief PDF is attached to. */
export const BRIEF_FILE_COLUMN = 'Brief';

/**
 * Maps a discovery brief onto Monday column titles.
 *
 * Titles rather than IDs, because a board's IDs are opaque and a human has
 * to be able to see which column is meant to hold what. Adding a column to
 * the board whose title matches a key here is all it takes to start
 * capturing that field: nothing in this file needs to change.
 */
export function briefToFields(brief = {}) {
  return {
    'Launch date': brief.startDate || undefined,
    Stakeholder: brief.stakeholder || undefined,
    /* The form allows several, so all of them go. */
    'Campaign objective': brief.objective || undefined,
    'Total budget': num(brief.budget),
    /* Every brief starts as a draft. */
    Status: 'Draft',
    /* Not on the board as it stands. It is mapped anyway so that adding a
     * "Duration" column in Monday starts capturing it, and until then the
     * response says plainly that the column is missing rather than dropping
     * the value in silence, which is how it went unnoticed before. */
    Duration: num(brief.months),
  };
}

function num(v) {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
