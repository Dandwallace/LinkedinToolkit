/**
 * LinkedIn Campaign Manager export parser.
 *
 * Campaign Manager exports are hostile in three specific ways, and all three
 * have to be handled before a single number can be read:
 *
 *   1. Encoding. The .xls export is not an Excel file at all — it is
 *      tab-separated text in UTF-16 LE with a byte order mark. Read it as
 *      UTF-8 and every character comes back interleaved with nulls.
 *   2. Preamble. Four or five metadata lines sit above the real header
 *      ("Report: Campaign Performance", the date range, the account name,
 *      a blank line). The count varies by report type, so it is found
 *      rather than assumed.
 *   3. Columns. Headers differ between report types and have been renamed
 *      more than once. Everything is matched by pattern, never by position.
 *
 * Exports also come in two shapes: daily (one row per campaign per day) and
 * aggregated (one row per campaign for the whole range). Which one you have
 * changes what can be said about the data, so it is detected rather than
 * guessed at by the caller.
 */

/* ------------------------------------------------------------------ *
 * Decoding
 * ------------------------------------------------------------------ */

/**
 * Decodes a file's bytes to text, honouring whatever byte order mark is
 * present. UTF-16 LE is what Campaign Manager actually produces; the others
 * are here because users paste files in from Sheets and Excel too.
 */
export function decodeBytes(buffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decodeWith('utf-16le', bytes.subarray(2)), encoding: 'UTF-16 LE' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeWith('utf-16be', bytes.subarray(2)), encoding: 'UTF-16 BE' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decodeWith('utf-8', bytes.subarray(3)), encoding: 'UTF-8 (BOM)' };
  }

  /* No BOM. A UTF-16 LE file without one still gives itself away: ASCII
   * text produces a null byte in every other position. */
  if (bytes.length >= 4 && bytes[0] !== 0 && bytes[1] === 0 && bytes[3] === 0) {
    return { text: decodeWith('utf-16le', bytes), encoding: 'UTF-16 LE (no BOM)' };
  }
  return { text: decodeWith('utf-8', bytes), encoding: 'UTF-8' };
}

function decodeWith(label, bytes) {
  if (typeof TextDecoder === 'undefined') {
    /* Node without TextDecoder is not a target, but failing loudly beats
     * returning mojibake that looks like a parsing bug later. */
    throw new Error('This browser cannot decode the file (no TextDecoder).');
  }
  return new TextDecoder(label).decode(bytes);
}

/* ------------------------------------------------------------------ *
 * Delimiting
 * ------------------------------------------------------------------ */

/** Tabs win on a tie because the native export is tab-separated. */
export function detectDelimiter(text) {
  const lines = text.split('\n').filter((l) => l.trim()).slice(0, 12);
  let tabs = 0;
  let commas = 0;
  let semis = 0;
  for (const l of lines) {
    tabs += (l.match(/\t/g) || []).length;
    commas += (l.match(/,/g) || []).length;
    semis += (l.match(/;/g) || []).length;
  }
  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/** Quote-aware split into a grid. Blank rows are dropped. */
export function toRows(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/* ------------------------------------------------------------------ *
 * Columns
 *
 * `re` is matched against the trimmed header cell. Order matters within a
 * rule's alternatives only; between rules, the first header cell that
 * matches wins, so put the more specific pattern in the more specific rule.
 * ------------------------------------------------------------------ */
export const COLUMNS = [
  { key: 'date', label: 'Date', re: /^(date|day|date\s*\(.*\))$/i },
  /* LinkedIn has been renaming the hierarchy: what the export calls
   * "Campaign" is the group, and "Ad Set" is the delivery unit that used to
   * be called the campaign. Both column sets are matched, and which naming
   * the file uses is reported back so the UI can echo it. */
  { key: 'campaign', label: 'Campaign', re: /^campaign(\s*name)?$/i },
  { key: 'campaignId', label: 'Campaign ID', re: /^campaign\s*id$/i },
  { key: 'campaignGroup', label: 'Campaign group', re: /campaign\s*group(\s*name)?/i },
  { key: 'adSet', label: 'Ad Set', re: /^ad\s*set(\s*name)?$/i },
  { key: 'adSetId', label: 'Ad Set ID', re: /^ad\s*set\s*id$/i },
  { key: 'adSetType', label: 'Ad Set Type', re: /^ad\s*set\s*type$/i },
  { key: 'adSetStatus', label: 'Ad Set Status', re: /^ad\s*set\s*(status|state)$/i },
  { key: 'status', label: 'Status', re: /^(campaign\s*)?(status|state)$/i },
  { key: 'startDate', label: 'Start date', re: /^start\s*date$/i },
  { key: 'endDate', label: 'End date', re: /^end\s*date$/i },
  { key: 'creative', label: 'Creative', re: /creative|^ad\s*name$/i },
  { key: 'impressions', label: 'Impressions', re: /impression/i, numeric: true },
  { key: 'clicks', label: 'Clicks', re: /^(total\s*)?clicks$/i, numeric: true },
  { key: 'spend', label: 'Spend', re: /total\s*spent|amount\s*spent|^spend$|^spent$|^cost$/i, numeric: true },
  { key: 'reach', label: 'Reach', re: /^(reach|unique\s*impressions|members\s*reached)$/i, numeric: true },
  { key: 'frequency', label: 'Frequency', re: /^(average\s*)?frequency$/i, numeric: true },
  { key: 'dailyBudget', label: 'Daily budget', re: /daily\s*budget/i, numeric: true },
  { key: 'totalBudget', label: 'Total budget', re: /total\s*budget|lifetime\s*budget/i, numeric: true },
  { key: 'leads', label: 'Leads', re: /lead/i, numeric: true },
  { key: 'conversions', label: 'Conversions', re: /conversion/i, numeric: true },
  { key: 'ctr', label: 'CTR', re: /click\s*through\s*rate|^ctr$/i, numeric: true },
];

const REQUIRED = ['impressions', 'clicks', 'spend'];

/* ------------------------------------------------------------------ *
 * Report type
 *
 * LinkedIn writes the report type on the first metadata line, above the
 * header: "Ad Set Performance Report (in UTC)", "Campaign Performance
 * Report", "Ad Performance Report". Different types carry different
 * columns and describe different things, so the type is what a stored
 * report is filed under. Without it there is no way to tell a Delivery
 * export from a Performance one after the fact.
 * ------------------------------------------------------------------ */

/** Tidies the raw metadata line into a stable, comparable label. */
export function normaliseReportType(raw) {
  let s = String(raw || '')
    .replace(/^\s*report\s*[:\-]\s*/i, '')
    /* "(in UTC)" and friends are a timezone note, not part of the type. */
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (!/report$/i.test(s)) s = `${s} Report`;
  /* Title case, so "AD SET PERFORMANCE REPORT" and "Ad Set Performance
   * Report" are one type rather than two. */
  return s
    .split(' ')
    .map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** The key a report type is stored under. Case and spacing insensitive. */
export const reportTypeKey = (type) =>
  String(type || 'unspecified').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Reads the report type from the lines above the header.
 *
 * The first line carrying the word "report" is the one LinkedIn writes the
 * type on. Returns null when the preamble was stripped, which happens when
 * somebody opens the export and re-saves it.
 */
export function detectReportType(grid, headerIdx) {
  for (let i = 0; i < headerIdx; i++) {
    for (const cell of grid[i] || []) {
      const s = String(cell || '').trim();
      if (s && /report/i.test(s)) return normaliseReportType(s);
    }
  }
  return null;
}

/**
 * Finds the header row.
 *
 * Metadata lines are short and prose-like; the header is the first row that
 * matches several known column patterns at once. Scanning 20 rows covers
 * the 4-5 seen in practice with room for a report type nobody has run yet.
 */
export function findHeaderRow(rows) {
  let best = { index: -1, hits: 0 };
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const hits = COLUMNS.filter((rule) => cells.some((c) => rule.re.test(c))).length;
    if (hits > best.hits) best = { index: i, hits };
  }
  return best.hits >= 3 ? best.index : -1;
}

/** header cell index per known column, -1 where the column is absent. */
export function mapColumns(header) {
  const mapping = {};
  const taken = new Set();
  for (const rule of COLUMNS) {
    const idx = header.findIndex((h, i) => !taken.has(i) && rule.re.test(h.trim()));
    mapping[rule.key] = idx;
    if (idx >= 0) taken.add(idx);
  }
  return mapping;
}

/* ------------------------------------------------------------------ *
 * Cell coercion
 * ------------------------------------------------------------------ */

/** Strips currency symbols, thousands separators and stray percent signs. */
export function toNumber(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s || s === '-' || s === '—') return 0;
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** ISO first, then UK day-first, then whatever Date can make of it. */
export function toDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Campaign Manager writes status in several cases and spellings. */
export function normaliseStatus(v) {
  const s = String(v || '').trim().toUpperCase();
  if (!s) return null;
  if (/PAUS/.test(s)) return 'PAUSED';
  if (/ACTIVE|RUNNING|ENABLED|DELIVER/.test(s)) return 'ACTIVE';
  if (/COMPLET|ENDED|FINISH/.test(s)) return 'COMPLETED';
  if (/DRAFT/.test(s)) return 'DRAFT';
  if (/CANCEL/.test(s)) return 'CANCELLED';
  if (/ARCHIV/.test(s)) return 'ARCHIVED';
  return s;
}

const isoOrNull = (v) => {
  const d = toDate(v);
  return d ? d.toISOString().slice(0, 10) : null;
};

/* ------------------------------------------------------------------ *
 * The parse
 * ------------------------------------------------------------------ */

/**
 * Parses export text into rows plus a description of what was found.
 *
 * Returns `{ ok: false, error }` rather than throwing, because every caller
 * so far wants to show the user what went wrong rather than crash a page.
 */
export function parseExport(text, { encoding = null } = {}) {
  if (!text || !text.trim()) return { ok: false, error: 'The file is empty.' };

  const delimiter = detectDelimiter(text);
  const grid = toRows(text, delimiter);
  if (grid.length < 2) {
    return { ok: false, error: 'Could not find a header row and at least one row of data.' };
  }

  const headerIdx = findHeaderRow(grid);
  if (headerIdx < 0) {
    return {
      ok: false,
      error:
        'No recognisable header row. Export from Campaign Manager without editing it first, because ' +
        'a header rewritten by hand will not match.',
    };
  }

  const header = grid[headerIdx].map((h) => h.trim());
  const mapping = mapColumns(header);
  const missing = REQUIRED.filter((k) => mapping[k] < 0);
  if (missing.length) {
    const labels = missing.map((k) => COLUMNS.find((c) => c.key === k).label);
    return {
      ok: false,
      error: `Found the header but not these columns: ${labels.join(', ')}. This looks like a report type that does not carry performance figures.`,
      header,
    };
  }

  const cell = (row, key) => (mapping[key] >= 0 ? row[mapping[key]] : undefined);

  /* Which naming the export uses. When an Ad Set column is present, the
   * Campaign column is the group and Ad Set is the delivery unit; without
   * one, Campaign is still the delivery unit and the group sits in
   * Campaign Group if it is there at all. */
  const newNaming = mapping.adSet >= 0;
  const labels = newNaming
    ? { group: 'Campaign', unit: 'Ad Set' }
    : { group: 'Campaign group', unit: 'Campaign' };

  /* "Start Date" is the row's day in a daily export, but the schedule in an
   * aggregated one. An End Date column alongside it settles which: a report
   * carrying both is describing a campaign's run, not a single day. */
  const scheduleCols = mapping.startDate >= 0 && mapping.endDate >= 0;
  const dateFrom = mapping.date >= 0 ? 'date' : scheduleCols ? null : 'startDate';

  const rows = [];
  let undated = 0;

  for (const r of grid.slice(headerIdx + 1)) {
    const campaign = String(cell(r, 'campaign') || '').trim();
    /* Exports end with a totals line, and counting it would double every
     * figure on the page. It puts the word in the first column, which is
     * usually the date rather than the campaign, so both are checked. */
    if (isTotalsRow(r, campaign)) continue;

    const d = dateFrom ? toDate(cell(r, dateFrom)) : null;
    if (!d) undated++;

    const adSet = String(cell(r, 'adSet') || '').trim();
    const groupName = newNaming ? campaign : String(cell(r, 'campaignGroup') || '').trim();
    const unitName = newNaming ? adSet : campaign;

    const impressions = toNumber(cell(r, 'impressions'));
    const clicks = toNumber(cell(r, 'clicks'));
    const spend = toNumber(cell(r, 'spend'));
    const reach = mapping.reach >= 0 ? toNumber(cell(r, 'reach')) : 0;
    const statedFreq = mapping.frequency >= 0 ? toNumber(cell(r, 'frequency')) : 0;

    rows.push({
      date: d ? d.toISOString().slice(0, 10) : null,
      /* `campaign` stays the delivery unit so the analysis code, which only
       * ever cared about the thing that spends, reads the same either way. */
      campaign: unitName || groupName || 'All campaigns',
      unit: unitName || groupName || 'All campaigns',
      group: groupName || null,
      campaignId: String(cell(r, 'campaignId') || '').trim() || null,
      adSetId: String(cell(r, 'adSetId') || '').trim() || null,
      adSetType: String(cell(r, 'adSetType') || '').trim() || null,
      campaignGroup: groupName || null,
      status: normaliseStatus(cell(r, 'adSetStatus') ?? cell(r, 'status')),
      groupStatus: normaliseStatus(newNaming ? cell(r, 'status') : cell(r, 'status')),
      startDate: mapping.startDate >= 0 && scheduleCols ? isoOrNull(cell(r, 'startDate')) : null,
      endDate: mapping.endDate >= 0 ? isoOrNull(cell(r, 'endDate')) : null,
      creative: String(cell(r, 'creative') || '').trim() || null,
      impressions,
      clicks,
      spend,
      reach,
      /* Prefer LinkedIn's own frequency; derive it only when reach is
       * present, because impressions alone say nothing about it. */
      frequency: statedFreq || (reach ? impressions / reach : 0),
      dailyBudget: mapping.dailyBudget >= 0 ? toNumber(cell(r, 'dailyBudget')) : null,
      totalBudget: mapping.totalBudget >= 0 ? toNumber(cell(r, 'totalBudget')) : null,
      leads: mapping.leads >= 0 ? toNumber(cell(r, 'leads')) : 0,
      conversions: mapping.conversions >= 0 ? toNumber(cell(r, 'conversions')) : 0,
    });
  }

  if (!rows.length) {
    return { ok: false, error: 'Found the header but no rows of data underneath it.', header };
  }

  const dated = rows.filter((r) => r.date);
  const dates = [...new Set(dated.map((r) => r.date))].sort();
  const campaigns = [...new Set(rows.map((r) => r.campaign))];

  return {
    ok: true,
    rows,
    header,
    mapping,
    delimiter: delimiter === '\t' ? 'tab' : delimiter === ';' ? 'semicolon' : 'comma',
    encoding,
    metadataLines: headerIdx,
    /* The lines above the header are worth keeping: they carry the account
     * name and the date range the user chose in Campaign Manager. */
    preamble: grid.slice(0, headerIdx).map((r) => r.filter(Boolean).join(' · ')).filter(Boolean),
    granularity: detectGranularity(rows, dates),
    /* Null when the preamble is missing. The caller decides what to call an
     * export whose type cannot be read rather than guessing one here. */
    reportType: detectReportType(grid, headerIdx),
    /* Which questions this report can answer. A Delivery export carries no
     * status column, so it cannot say what is paused; asking it to would
     * quietly report every campaign as running. */
    hasStatus: mapping.status >= 0 || mapping.adSetStatus >= 0,
    hasSpend: mapping.spend >= 0,
    labels,
    hasAdSets: newNaming,
    groups: [...new Set(rows.map((r) => r.group).filter(Boolean))],
    dates,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
    days: dates.length,
    campaigns,
    columns: COLUMNS.filter((c) => mapping[c.key] >= 0).map((c) => c.label),
    undated,
    totals: totalsOf(rows),
  };
}

/**
 * Daily or aggregated.
 *
 * A daily export repeats each campaign across dates; an aggregated one has
 * one row per campaign, and often no date column at all. Comparing row
 * count against distinct campaigns separates them without trusting the
 * report's own title, which the user may have renamed on export.
 */
const TOTALS = /^(grand\s+)?totals?$/i;

function isTotalsRow(row, campaign) {
  if (TOTALS.test(campaign)) return true;
  const first = String(row[0] ?? '').trim();
  return TOTALS.test(first);
}

export function detectGranularity(rows, dates) {
  if (!dates.length) return 'aggregated';
  if (dates.length > 1) return 'daily';
  /* One date and one row per campaign is a single day of daily data —
   * treat it as daily, since another day's export will append cleanly. */
  const campaigns = new Set(rows.map((r) => r.campaign)).size;
  return rows.length > campaigns ? 'daily' : 'aggregated';
}

function totalsOf(rows) {
  const t = rows.reduce(
    (a, r) => ({
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      spend: a.spend + r.spend,
      leads: a.leads + r.leads,
      conversions: a.conversions + r.conversions,
    }),
    { impressions: 0, clicks: 0, spend: 0, leads: 0, conversions: 0 }
  );
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
    cpl: t.leads ? t.spend / t.leads : 0,
  };
}

/** Reads a File or Blob and parses it. Encoding is detected from the bytes. */
export async function parseExportFile(file) {
  const buffer = await file.arrayBuffer();
  const { text, encoding } = decodeBytes(buffer);
  const result = parseExport(text, { encoding });
  return { ...result, filename: file.name, bytes: file.size };
}
