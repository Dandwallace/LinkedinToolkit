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
  /* Every date header may carry a timezone note — Campaign Manager writes
   * "Start Date (in UTC)" — so the qualifier is part of the pattern rather
   * than something the header has to be cleaned of first. */
  { key: 'date', label: 'Date', re: /^(date|day)(\s*\(.*\))?$/i },
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
  /* The row's own date bucket. Anchored, so "Campaign Start Date" and "Ad
   * Set Start Date" — which sit in the same file and describe a schedule,
   * not a day — can never be picked up as the row date. */
  { key: 'startDate', label: 'Start date', re: /^start\s*date(\s*\(.*\))?$/i },
  { key: 'endDate', label: 'End date', re: /^end\s*date(\s*\(.*\))?$/i },
  /* The schedule columns proper. Matched explicitly so the run dates are
   * available to the health checks, which otherwise cannot tell a campaign
   * that has finished from one that is silently failing. */
  { key: 'campaignStart', label: 'Campaign start date', re: /^campaign\s*start\s*date(\s*\(.*\))?$/i },
  { key: 'campaignEnd', label: 'Campaign end date', re: /^campaign\s*end\s*date(\s*\(.*\))?$/i },
  { key: 'adSetStart', label: 'Ad Set start date', re: /^ad\s*set\s*start\s*date(\s*\(.*\))?$/i },
  { key: 'adSetEnd', label: 'Ad Set end date', re: /^ad\s*set\s*end\s*date(\s*\(.*\))?$/i },
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
   * Report" are one type rather than two. Every word, including the short
   * ones: "Ad Set" is two words of the name, not filler. */
  return s
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
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

const SLASHED = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

/**
 * ISO first, then a slashed date in the given order, then whatever Date can
 * make of it.
 *
 * `order` is 'dmy' or 'mdy'. Campaign Manager formats slashed dates in the
 * account's own locale, so a UK account exports 18/07/2024 and a US one
 * exports 7/18/2024 from the same report. Reading the wrong one silently
 * turns 7/18 into an invalid month and 3/4 into the wrong day, so the order
 * is worked out from the file (see detectDateOrder) and passed in rather
 * than assumed here. UK day-first stays the default because that is what
 * this agency's own accounts produce.
 */
export function toDate(v, order = 'dmy') {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = SLASHED.exec(s);
  if (m) {
    const [day, month] = order === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(+m[3], month - 1, day));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Works out whether a file's slashed dates are day-first or month-first.
 *
 * Any value whose first part is above 12 can only be a day, and any value
 * whose second part is above 12 can only be a day in the other position.
 * One export usually contains several date columns, and it only takes one
 * unambiguous value anywhere in the file to settle every other one — which
 * is why this is fed the whole file's dates rather than a single column.
 *
 * Returns null when nothing in the file settles it, which happens on a
 * short export where every date falls in the first twelve days of a month.
 */
export function detectDateOrder(values) {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const v of values) {
    const m = SLASHED.exec(String(v ?? '').trim());
    if (!m) continue;
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) dayFirst++;
    else if (b > 12 && a <= 12) monthFirst++;
  }
  if (dayFirst && !monthFirst) return 'dmy';
  if (monthFirst && !dayFirst) return 'mdy';
  return null;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Reads the range the user asked for out of the preamble.
 *
 * LinkedIn writes it in long form — "Report Start: January 1, 2026, 12:00
 * AM" — which is the one place in the file where the date is unambiguous.
 * It is worth having for its own sake, because an aggregated export has no
 * per-row date and the range is the only thing that says what period the
 * numbers cover.
 */
export function detectReportWindow(grid, headerIdx) {
  const found = {};
  for (let i = 0; i < headerIdx; i++) {
    for (const cell of grid[i] || []) {
      const m = /report\s*(start|end)\s*[:\-]\s*([a-z]+)\s+(\d{1,2})\s*,\s*(\d{4})/i.exec(
        String(cell || '')
      );
      if (!m) continue;
      const month = MONTHS.indexOf(m[2].toLowerCase());
      if (month < 0) continue;
      const d = new Date(Date.UTC(+m[4], month, +m[3]));
      found[m[1].toLowerCase()] = d.toISOString().slice(0, 10);
    }
  }
  return { from: found.start || null, to: found.end || null };
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

const isoOrNull = (v, order) => {
  const d = toDate(v, order);
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

  /* Which column holds the row's date.
   *
   * A daily export carries Start Date AND End Date on every row, both set
   * to that row's day. Treating the pair as a campaign schedule and giving
   * up on dates entirely meant every row of a manual export came back
   * undated, which silently disabled the day-of-week, fatigue and anomaly
   * work. So look at the data: if Start Date varies from row to row, it is
   * the row's date whatever else is alongside it. */
  const body = grid.slice(headerIdx + 1);
  const distinctStarts = mapping.startDate >= 0
    ? new Set(
        body
          .map((r) => String(r[mapping.startDate] ?? '').trim())
          .filter(Boolean)
      ).size
    : 0;
  const startVaries = distinctStarts > 1;
  const scheduleCols = mapping.startDate >= 0 && mapping.endDate >= 0 && !startVaries;
  const dateFrom = mapping.date >= 0 ? 'date' : mapping.startDate >= 0 && !scheduleCols ? 'startDate' : null;

  /* Day-first or month-first, decided once for the file. Every date column
   * is sampled, not just the row date: the schedule columns reach further
   * back and are far more likely to contain the day above 12 that settles
   * it. */
  const dateCols = ['date', 'startDate', 'endDate', 'campaignStart', 'campaignEnd', 'adSetStart', 'adSetEnd']
    .map((k) => mapping[k])
    .filter((i) => i >= 0);
  const dateOrder =
    detectDateOrder(body.flatMap((r) => dateCols.map((i) => r[i]))) || 'dmy';

  /* A blank cell and an absent column both mean "not given" here, so they
   * collapse to null before the fallbacks below choose between them. */
  const val = (row, key) => {
    const s = String(cell(row, key) ?? '').trim();
    return s || null;
  };

  /* The schedule a row belongs to. Ad set first, because that is the rung
   * that actually delivers; the campaign's dates are the outer flight. */
  const scheduleStart = (r) =>
    isoOrNull(val(r, 'adSetStart') ?? val(r, 'campaignStart') ?? (scheduleCols ? val(r, 'startDate') : null), dateOrder);
  const scheduleEnd = (r) =>
    isoOrNull(val(r, 'adSetEnd') ?? val(r, 'campaignEnd') ?? (scheduleCols ? val(r, 'endDate') : null), dateOrder);

  const rows = [];
  let undated = 0;

  for (const r of body) {
    const campaign = String(cell(r, 'campaign') || '').trim();
    /* Exports end with a totals line, and counting it would double every
     * figure on the page. It puts the word in the first column, which is
     * usually the date rather than the campaign, so both are checked. */
    if (isTotalsRow(r, campaign)) continue;

    const d = dateFrom ? toDate(cell(r, dateFrom), dateOrder) : null;
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
      startDate: scheduleStart(r),
      endDate: scheduleEnd(r),
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

  /* An aggregated export puts one row per ad set against a single date —
   * the first day of the period, not a day the numbers belong to. Reporting
   * "1 Jan to 1 Jan" for eight months of spend is worse than saying nothing,
   * so the range the user actually asked for wins whenever the rows cannot
   * describe one themselves. */
  const window = detectReportWindow(grid, headerIdx);
  const rangeFromRows = dates.length > 1;
  const from = rangeFromRows ? dates[0] : window.from || dates[0] || null;
  const to = rangeFromRows ? dates[dates.length - 1] : window.to || dates[0] || null;

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
    from,
    to,
    /* Whether the range above came from the rows or from the preamble, so
     * the UI can say which without guessing. */
    rangeFrom: rangeFromRows ? 'rows' : window.from ? 'report' : dates.length ? 'rows' : 'none',
    reportWindow: window,
    /* Day-first or month-first, so a wrong reading is visible rather than
     * silently shifting every date by a fortnight. */
    dateOrder,
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
