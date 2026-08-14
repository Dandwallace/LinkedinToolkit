/**
 * Monday.com client.
 *
 * Server-side only. The API token can write to every board on the account,
 * so it never reaches the browser: the intake form posts to
 * /api/monday/brief and this module does the talking.
 *
 * Monday has one GraphQL endpoint for everything, and column values go in
 * as a JSON string keyed by column ID, not column title. Titles are what a
 * human knows, so this looks the IDs up from the board and maps by title,
 * which means the board can be rearranged without breaking the write.
 */

const API = 'https://api.monday.com/v2';
const API_VERSION = '2024-10';

export function mondayConfig() {
  return {
    token: process.env.MONDAY_API_TOKEN || '',
    boardId: process.env.MONDAY_BOARD_ID || '',
    /* Optional. Without it the item lands in the board's first group. */
    groupId: process.env.MONDAY_GROUP_ID || '',
  };
}

export function isConfigured() {
  const { token, boardId } = mondayConfig();
  return Boolean(token && boardId);
}

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

/** Column IDs keyed by lower-cased column title. */
export async function columnsByTitle(boardId) {
  const data = await query(
    `query ($ids: [ID!]) { boards (ids: $ids) { columns { id title type } } }`,
    { ids: [String(boardId)] }
  );
  const cols = data?.boards?.[0]?.columns || [];
  const map = new Map();
  for (const c of cols) map.set(c.title.trim().toLowerCase(), c);
  return map;
}

/**
 * Creates one item.
 *
 * `fields` is keyed by human column title. Anything with no matching column
 * on the board is skipped rather than failing the whole write, and the
 * skipped titles come back so the caller can say what was dropped.
 */
export async function createItem(itemName, fields) {
  const cfg = mondayConfig();
  if (!cfg.token || !cfg.boardId) {
    throw new Error(
      'Monday is not configured. Set MONDAY_API_TOKEN and MONDAY_BOARD_ID, and MONDAY_GROUP_ID if the item should land in a particular group.'
    );
  }

  const cols = await columnsByTitle(cfg.boardId);
  const values = {};
  const skipped = [];

  for (const [title, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    const col = cols.get(title.trim().toLowerCase());
    if (!col) {
      skipped.push(title);
      continue;
    }
    values[col.id] = formatValue(col.type, value);
  }

  const data = await query(
    `mutation ($board: ID!, $group: String, $name: String!, $values: JSON!) {
       create_item (
         board_id: $board,
         group_id: $group,
         item_name: $name,
         column_values: $values,
         create_labels_if_missing: true
       ) { id name }
     }`,
    {
      board: String(cfg.boardId),
      group: cfg.groupId || null,
      name: itemName,
      values: JSON.stringify(values),
    }
  );

  const id = data?.create_item?.id;
  return {
    id,
    url: id ? `https://view.monday.com/boards/${cfg.boardId}/pulses/${id}` : null,
    skipped,
  };
}

/** Monday wants a different JSON shape per column type. */
function formatValue(type, value) {
  switch (type) {
    case 'numbers':
      return String(Number(value));
    case 'date':
      return { date: String(value).slice(0, 10) };
    case 'status':
    case 'dropdown':
      return { labels: String(value).split(',').map((v) => v.trim()).filter(Boolean) };
    case 'email':
      return { email: String(value), text: String(value) };
    case 'link':
      return { url: String(value), text: String(value) };
    case 'long_text':
      return { text: String(value) };
    default:
      return String(value);
  }
}

/**
 * Maps a discovery brief onto Monday column titles.
 *
 * Titles rather than IDs, because a board's IDs are opaque and a human has
 * to be able to see which column is meant to hold what.
 */
export function briefToFields(brief = {}, extras = {}) {
  return {
    Client: brief.client,
    Campaign: brief.campaignName,
    Sector: brief.sector,
    Website: brief.website,
    Markets: brief.markets,
    Objective: brief.objective,
    'Success looks like': brief.successLooksLike,
    'Total budget': num(brief.budget),
    'Duration (months)': num(brief.months),
    'Start date': brief.startDate || undefined,
    'Planned campaigns': num(brief.campaignCount),
    Audience: brief.audienceNotes,
    'Target account list': brief.targetAccountList,
    'Running now': brief.runningNow,
    'Insight Tag': brief.insightTag,
    'Conversion tracking': brief.conversionTracking,
    CRM: brief.crm,
    'Lead routing': brief.leadRouting,
    'Landing pages': brief.landingPages,
    Assets: Array.isArray(brief.assets) && brief.assets.length ? brief.assets.join(', ') : undefined,
    Creative:
      Array.isArray(brief.creatives) && brief.creatives.length
        ? brief.creatives.map((c) => `${c.quantity} x ${c.format}`).join(', ')
        : undefined,
    Constraints: brief.constraints,
    Flags: extras.flags || undefined,
    Captured: new Date().toISOString().slice(0, 10),
  };
}

function num(v) {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
