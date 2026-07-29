'use client';

import React, { useState, useMemo } from 'react';

/* ------------------------------------------------------------------ *
 * CSV parsing
 *
 * Written by hand rather than pulling a library, mostly so the quirks of
 * real Campaign Manager exports can be handled inline: preamble rows
 * above the header, tab delimiters when pasted from Sheets, currency
 * symbols inside numeric cells.
 * ------------------------------------------------------------------ */

function detectDelimiter(text) {
  const line = text.split('\n').find((l) => l.trim()) || '';
  const commas = (line.match(/,/g) || []).length;
  const tabs = (line.match(/\t/g) || []).length;
  return tabs > commas ? '\t' : ',';
}

function parseCSV(text, delim) {
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

/* Column detection. LinkedIn's export headers shift between report types
 * and have changed more than once, so match loosely and let the user
 * correct anything that lands wrong. */
const COLUMN_RULES = [
  { key: 'date', label: 'Date', re: /^(date|day|start date)/i, required: true },
  { key: 'campaign', label: 'Campaign', re: /campaign\s*name|^campaign$/i },
  { key: 'creative', label: 'Creative / Ad', re: /creative|ad\s*name/i },
  { key: 'impressions', label: 'Impressions', re: /impression/i, required: true, numeric: true },
  { key: 'clicks', label: 'Clicks', re: /^(total\s*)?clicks$/i, required: true, numeric: true },
  { key: 'spend', label: 'Spend', re: /spent|spend|^cost$|amount/i, required: true, numeric: true },
  { key: 'leads', label: 'Leads', re: /lead/i, numeric: true },
  { key: 'conversions', label: 'Conversions', re: /conversion/i, numeric: true },
];

/** Finds the header row — real exports often carry account metadata above it. */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const hits = COLUMN_RULES.filter((r) => rows[i].some((c) => r.re.test(c.trim()))).length;
    if (hits >= 3) return i;
  }
  return 0;
}

const toNumber = (v) => {
  if (v == null) return 0;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const toDate = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  /* ISO first, then UK day-first, then let Date have a go. */
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ------------------------------------------------------------------ */

export default function PerformanceAnalyser() {
  const [raw, setRaw] = useState('');
  const [overrides, setOverrides] = useState({});
  const [currency, setCurrency] = useState('£');

  const parsed = useMemo(() => {
    if (!raw.trim()) return null;
    const delim = detectDelimiter(raw);
    const rows = parseCSV(raw, delim);
    if (rows.length < 2) return { error: 'Could not find at least a header row and one data row.' };

    const headerIdx = findHeaderRow(rows);
    const header = rows[headerIdx].map((h) => h.trim());
    const body = rows.slice(headerIdx + 1).filter((r) => r.length >= 2);

    const mapping = {};
    for (const rule of COLUMN_RULES) {
      const found = header.findIndex((h) => rule.re.test(h));
      mapping[rule.key] = overrides[rule.key] !== undefined ? overrides[rule.key] : found;
    }

    const missing = COLUMN_RULES.filter((r) => r.required && mapping[r.key] < 0);
    if (missing.length) {
      return {
        error: `Could not find these columns: ${missing.map((m) => m.label).join(', ')}. Map them manually below.`,
        header,
        mapping,
        body,
      };
    }

    const records = body
      .map((r) => {
        const get = (k) => (mapping[k] >= 0 ? r[mapping[k]] : undefined);
        const d = toDate(get('date'));
        if (!d) return null;
        return {
          date: d,
          dow: d.getUTCDay(),
          campaign: (get('campaign') || 'All campaigns').trim(),
          creative: (get('creative') || '').trim(),
          impressions: toNumber(get('impressions')),
          clicks: toNumber(get('clicks')),
          spend: toNumber(get('spend')),
          leads: toNumber(get('leads')),
          conversions: toNumber(get('conversions')),
        };
      })
      .filter(Boolean);

    if (!records.length) {
      return { error: 'Found columns but no rows with a readable date.', header, mapping, body };
    }
    return { header, mapping, records };
  }, [raw, overrides]);

  const records = parsed?.records;

  /* ---------- totals ---------- */
  const totals = useMemo(() => {
    if (!records) return null;
    const t = records.reduce(
      (a, r) => ({
        impressions: a.impressions + r.impressions,
        clicks: a.clicks + r.clicks,
        spend: a.spend + r.spend,
        leads: a.leads + r.leads,
        conversions: a.conversions + r.conversions,
      }),
      { impressions: 0, clicks: 0, spend: 0, leads: 0, conversions: 0 }
    );
    const dates = records.map((r) => r.date.getTime());
    return {
      ...t,
      ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
      cpc: t.clicks ? t.spend / t.clicks : 0,
      cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
      cpl: t.leads ? t.spend / t.leads : 0,
      from: new Date(Math.min(...dates)),
      to: new Date(Math.max(...dates)),
      days: new Set(records.map((r) => r.date.toISOString().slice(0, 10))).size,
      campaigns: new Set(records.map((r) => r.campaign)).size,
    };
  }, [records]);

  /* ---------- day of week ---------- */
  const dow = useMemo(() => {
    if (!records) return null;
    const buckets = DAY_NAMES.map(() => ({ spend: 0, clicks: 0, leads: 0, impressions: 0 }));
    for (const r of records) {
      const b = buckets[r.dow];
      b.spend += r.spend;
      b.clicks += r.clicks;
      b.leads += r.leads;
      b.impressions += r.impressions;
    }
    const totalSpend = buckets.reduce((n, b) => n + b.spend, 0);
    const totalLeads = buckets.reduce((n, b) => n + b.leads, 0);
    const totalClicks = buckets.reduce((n, b) => n + b.clicks, 0);
    const useLeads = totalLeads > 0;
    const outcomeTotal = useLeads ? totalLeads : totalClicks;

    const rows = [1, 2, 3, 4, 5, 6, 0].map((i) => {
      const b = buckets[i];
      const outcome = useLeads ? b.leads : b.clicks;
      return {
        day: DAY_NAMES[i],
        spend: b.spend,
        pctSpend: totalSpend ? (b.spend / totalSpend) * 100 : 0,
        outcome,
        pctOutcome: outcomeTotal ? (outcome / outcomeTotal) * 100 : 0,
        cost: outcome ? b.spend / outcome : 0,
      };
    });

    const weekendSpend = buckets[0].spend + buckets[6].spend;
    const weekendOutcome = useLeads
      ? buckets[0].leads + buckets[6].leads
      : buckets[0].clicks + buckets[6].clicks;
    const wsPct = totalSpend ? (weekendSpend / totalSpend) * 100 : 0;
    const woPct = outcomeTotal ? (weekendOutcome / outcomeTotal) * 100 : 0;

    return {
      rows,
      useLeads,
      weekendSpend,
      wsPct,
      woPct,
      wasted: wsPct > woPct ? weekendSpend * (1 - woPct / Math.max(wsPct, 0.01)) : 0,
    };
  }, [records]);

  /* ---------- fatigue: first half vs second half CTR ---------- */
  const fatigue = useMemo(() => {
    if (!records || !totals) return null;
    const groups = new Map();
    for (const r of records) {
      const key = r.creative || r.campaign;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const mid = (totals.from.getTime() + totals.to.getTime()) / 2;
    const out = [];
    for (const [name, rows] of groups) {
      const first = rows.filter((r) => r.date.getTime() <= mid);
      const second = rows.filter((r) => r.date.getTime() > mid);
      const imp1 = first.reduce((n, r) => n + r.impressions, 0);
      const imp2 = second.reduce((n, r) => n + r.impressions, 0);
      if (imp1 < 500 || imp2 < 500) continue;
      const ctr1 = (first.reduce((n, r) => n + r.clicks, 0) / imp1) * 100;
      const ctr2 = (second.reduce((n, r) => n + r.clicks, 0) / imp2) * 100;
      if (!ctr1) continue;
      out.push({ name, ctr1, ctr2, change: ((ctr2 - ctr1) / ctr1) * 100, imp: imp1 + imp2 });
    }
    return out.sort((a, b) => a.change - b.change);
  }, [records, totals]);

  /* ---------- anomalies: daily cost per outcome beyond 2 sd ---------- */
  const anomalies = useMemo(() => {
    if (!records) return null;
    const byDay = new Map();
    for (const r of records) {
      const k = r.date.toISOString().slice(0, 10);
      if (!byDay.has(k)) byDay.set(k, { spend: 0, clicks: 0, leads: 0, impressions: 0 });
      const d = byDay.get(k);
      d.spend += r.spend;
      d.clicks += r.clicks;
      d.leads += r.leads;
      d.impressions += r.impressions;
    }
    const useLeads = [...byDay.values()].reduce((n, d) => n + d.leads, 0) > 0;
    const series = [...byDay.entries()]
      .map(([date, d]) => {
        const outcome = useLeads ? d.leads : d.clicks;
        return { date, value: outcome ? d.spend / outcome : null, spend: d.spend, outcome };
      })
      .filter((d) => d.value !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (series.length < 7) return { series, flagged: [], useLeads, tooShort: true };

    const vals = series.map((s) => s.value);
    const mean = vals.reduce((n, v) => n + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((n, v) => n + (v - mean) ** 2, 0) / vals.length);
    const flagged = series
      .filter((s) => sd > 0 && Math.abs(s.value - mean) > 2 * sd)
      .map((s) => ({ ...s, mean, sd, dir: s.value > mean ? 'high' : 'low' }));
    return { series, flagged, mean, sd, useLeads, tooShort: false };
  }, [records]);

  const money = (n, dp = 2) =>
    currency + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const num = (n) => Math.round(n || 0).toLocaleString('en-GB');
  const dstr = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const summary = useMemo(() => {
    if (!totals || !dow) return '';
    const lines = [
      `PERFORMANCE SUMMARY — ${dstr(totals.from)} to ${dstr(totals.to)}`,
      '',
      `Spend ${money(totals.spend, 0)} across ${totals.campaigns} campaign(s) over ${totals.days} days.`,
      `${num(totals.impressions)} impressions, ${num(totals.clicks)} clicks (${totals.ctr.toFixed(2)}% CTR), ${money(totals.cpc)} CPC, ${money(totals.cpm)} CPM.`,
      totals.leads ? `${num(totals.leads)} leads at ${money(totals.cpl)} cost per lead.` : '',
      '',
      dow.wasted > 0
        ? `Weekends took ${dow.wsPct.toFixed(1)}% of spend but produced ${dow.woPct.toFixed(1)}% of ${dow.useLeads ? 'leads' : 'clicks'} — roughly ${money(dow.wasted, 0)} underperforming. A weekday-only schedule is worth testing.`
        : 'No material weekend waste in this period.',
      '',
      fatigue && fatigue.filter((f) => f.change < -20).length
        ? `Fatigue: ${fatigue.filter((f) => f.change < -20).length} creative(s) lost more than 20% of CTR between the first and second half of the period.`
        : '',
      anomalies && anomalies.flagged.length
        ? `${anomalies.flagged.length} day(s) fell outside two standard deviations on cost per ${anomalies.useLeads ? 'lead' : 'click'}.`
        : '',
    ];
    return lines.filter(Boolean).join('\n');
  }, [totals, dow, fatigue, anomalies, currency]);

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Performance analysis</h1>
            <div className="linked">From a Campaign Manager CSV export — no API access needed</div>
          </div>
          <dl className="mast-meta">
            <div>
              <dt>Form</dt>
              <dd>LA-08</dd>
            </div>
            {totals && (
              <div>
                <dt>Rows</dt>
                <dd>{records.length}</dd>
              </div>
            )}
          </dl>
        </header>

        <div className="body">
          {/* ---------------- input ---------------- */}
          <section className="block input-block">
            <div className="block-head">
              Paste export
              <span className="cur">
                Currency
                {['£', '€', '$'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={currency === c ? 'cur-b on' : 'cur-b'}
                    onClick={() => setCurrency(c)}
                  >
                    {c}
                  </button>
                ))}
              </span>
            </div>
            <textarea
              className="ta"
              rows={raw ? 4 : 8}
              value={raw}
              placeholder={
                'Export from Campaign Manager, open it, select all, paste here.\n\nWorks with commas or tabs. Metadata rows above the header are skipped automatically.'
              }
              onChange={(e) => setRaw(e.target.value)}
            />
            {parsed?.error && (
              <div className="issue blocker">
                <span className="issue-tag">Could not read</span>
                {parsed.error}
              </div>
            )}
            {parsed?.header && (
              <div className="mapping">
                <div className="map-head">Column mapping — correct anything wrong</div>
                <div className="map-grid">
                  {COLUMN_RULES.map((rule) => (
                    <label className="map-row" key={rule.key}>
                      <span className="map-lab">
                        {rule.label}
                        {rule.required && <em>*</em>}
                      </span>
                      <select
                        className="map-sel"
                        value={parsed.mapping[rule.key]}
                        onChange={(e) =>
                          setOverrides((p) => ({ ...p, [rule.key]: Number(e.target.value) }))
                        }
                      >
                        <option value={-1}>— not present —</option>
                        {parsed.header.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>

          {totals && (
            <>
              {/* ---------------- totals ---------------- */}
              <section className="block">
                <div className="block-head">
                  Totals
                  <span className="range">
                    {dstr(totals.from)} — {dstr(totals.to)} · {totals.days} days
                  </span>
                </div>
                <div className="stats">
                  {[
                    ['Spend', money(totals.spend, 0)],
                    ['Impressions', num(totals.impressions)],
                    ['Clicks', num(totals.clicks)],
                    ['CTR', totals.ctr.toFixed(2) + '%'],
                    ['CPC', money(totals.cpc)],
                    ['CPM', money(totals.cpm)],
                    ...(totals.leads
                      ? [
                          ['Leads', num(totals.leads)],
                          ['CPL', money(totals.cpl)],
                        ]
                      : []),
                  ].map(([l, v]) => (
                    <div className="stat" key={l}>
                      <span className="stat-lab">{l}</span>
                      <span className="stat-val">{v}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ---------------- day of week ---------------- */}
              <section className="block">
                <div className="block-head">
                  Day of week
                  <span className="range">the dayparting business case</span>
                </div>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Spend</th>
                      <th>% spend</th>
                      <th>{dow.useLeads ? 'Leads' : 'Clicks'}</th>
                      <th>% of total</th>
                      <th>Cost per</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dow.rows.map((r) => {
                      const gap = r.pctSpend - r.pctOutcome;
                      return (
                        <tr key={r.day} className={gap > 3 ? 'poor' : gap < -3 ? 'good' : ''}>
                          <th>{r.day}</th>
                          <td>{money(r.spend, 0)}</td>
                          <td>{r.pctSpend.toFixed(1)}%</td>
                          <td>{num(r.outcome)}</td>
                          <td>{r.pctOutcome.toFixed(1)}%</td>
                          <td>{r.cost ? money(r.cost) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className={`verdict ${dow.wasted > 0 ? 'warn' : 'ok'}`}>
                  {dow.wasted > 0
                    ? `Weekends absorbed ${dow.wsPct.toFixed(1)}% of spend and returned ${dow.woPct.toFixed(1)}% of ${dow.useLeads ? 'leads' : 'clicks'}. Roughly ${money(dow.wasted, 0)} underperformed over this period — that is the number to put in front of a client when proposing a schedule.`
                    : 'No material weekend waste here. Dayparting would not pay for itself on this account.'}
                </p>
              </section>

              {/* ---------------- fatigue ---------------- */}
              <section className="block">
                <div className="block-head">
                  Creative fatigue
                  <span className="range">CTR, first half vs second half</span>
                </div>
                {!fatigue?.length && (
                  <p className="none">
                    Not enough volume to compare halves. Each item needs 500+ impressions in both
                    halves of the period.
                  </p>
                )}
                {fatigue?.length > 0 && (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Creative / campaign</th>
                        <th>Impressions</th>
                        <th>CTR early</th>
                        <th>CTR late</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fatigue.map((f) => (
                        <tr
                          key={f.name}
                          className={f.change < -20 ? 'poor' : f.change > 10 ? 'good' : ''}
                        >
                          <th>{f.name}</th>
                          <td>{num(f.imp)}</td>
                          <td>{f.ctr1.toFixed(2)}%</td>
                          <td>{f.ctr2.toFixed(2)}%</td>
                          <td>
                            {f.change > 0 ? '+' : ''}
                            {f.change.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="caveat">
                  A halving of the period is a blunt instrument, but it survives the sparse daily
                  data most accounts produce. Treat a drop beyond 20% as worth rotating, not as proof.
                </p>
              </section>

              {/* ---------------- anomalies ---------------- */}
              <section className="block">
                <div className="block-head">
                  Anomalies
                  <span className="range">
                    daily cost per {anomalies?.useLeads ? 'lead' : 'click'}, beyond 2 sd
                  </span>
                </div>
                {anomalies?.tooShort && (
                  <p className="none">Needs at least seven days of data to establish a baseline.</p>
                )}
                {!anomalies?.tooShort && !anomalies?.flagged.length && (
                  <p className="none">
                    Nothing beyond two standard deviations. Mean {money(anomalies.mean)}, standard
                    deviation {money(anomalies.sd)}.
                  </p>
                )}
                {anomalies?.flagged.length > 0 && (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Spend</th>
                        <th>{anomalies.useLeads ? 'Leads' : 'Clicks'}</th>
                        <th>Cost per</th>
                        <th>vs mean</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anomalies.flagged.map((f) => (
                        <tr key={f.date} className={f.dir === 'high' ? 'poor' : 'good'}>
                          <th>{f.date}</th>
                          <td>{money(f.spend, 0)}</td>
                          <td>{num(f.outcome)}</td>
                          <td>{money(f.value)}</td>
                          <td>
                            {f.value > f.mean ? '+' : ''}
                            {(((f.value - f.mean) / f.mean) * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {/* ---------------- summary ---------------- */}
              <section className="block">
                <div className="block-head">Client summary</div>
                <pre className="summary">{summary}</pre>
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigator.clipboard?.writeText(summary)}
                >
                  Copy summary
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const CSS = `
.masthead{max-width:1000px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-bottom:none;padding:16px 22px 14px;display:flex;align-items:flex-end;
  justify-content:space-between;gap:20px;flex-wrap:wrap;}
.body{max-width:1000px;margin:0 auto;border:1px solid var(--ink);background:var(--white);}
.input-block{background:#F3F2EC;}
.block-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11.5px;
  letter-spacing:.15em;text-transform:uppercase;margin-bottom:10px;flex-wrap:wrap;}
.cur{display:flex;align-items:center;gap:4px;font-family:'Archivo Narrow',sans-serif;
  font-size:9.5px;letter-spacing:.15em;color:var(--ink-2);}
.cur-b{font-family:'Courier Prime',monospace;font-size:13px;padding:2px 8px;background:none;
  border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;}
.cur-b.on{background:var(--carbon);color:var(--white);border-color:var(--carbon);}
.cur-b:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.ta{width:100%;font-family:'Courier Prime',monospace;font-size:12px;line-height:1.55;
  color:var(--carbon);background:var(--white);border:1px solid var(--rule);padding:9px 11px;
  border-radius:0;outline:none;resize:vertical;}
.mapping{margin-top:12px;border-top:1px solid var(--rule);padding-top:11px;}
.map-head{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);margin-bottom:8px;}
.map-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:7px 16px;}
.map-row{display:grid;grid-template-columns:96px 1fr;align-items:center;gap:8px;}
.map-lab{font-family:'Archivo Narrow',sans-serif;font-weight:600;font-size:10px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2);}
.map-lab em{font-style:normal;color:var(--stamp);}
.map-sel{font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--carbon);
  background:var(--white);border:1px solid var(--rule);padding:3px 5px;
  border-radius:0;outline:none;width:100%;min-width:0;}
.map-sel:focus-visible{outline:2px solid var(--carbon);outline-offset:1px;}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));
  border-top:1px solid var(--rule);border-left:1px solid var(--rule);}
.stat{padding:10px 12px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);}
.stat-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);margin-bottom:3px;}
.stat-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:17px;color:var(--carbon);}
.tbl thead th{text-align:right;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-2);
  padding:5px 8px 6px 0;border-bottom:1px solid var(--rule);}
.tbl thead th:first-child{text-align:left;}
.tbl tbody th{text-align:left;font-family:'Archivo',sans-serif;font-weight:500;font-size:12.5px;
  color:var(--ink);padding:5px 8px 5px 0;border-bottom:1px dotted var(--rule);
  word-break:break-word;}
.tbl tbody td{text-align:right;font-family:'Courier Prime',monospace;font-size:12.5px;
  color:var(--ink-2);padding:5px 0 5px 8px;border-bottom:1px dotted var(--rule);}
.tbl tbody tr.poor th,.tbl tbody tr.poor td{background:#F9EDE9;color:#7A3B22;}
.tbl tbody tr.good th,.tbl tbody tr.good td{background:#EFF3ED;color:#255740;}
.verdict{margin:11px 0 0;font-size:12.5px;line-height:1.55;padding:9px 11px;
  border-left:3px solid var(--ok);background:#EFF3ED;color:#255740;}
.verdict.warn{border-left-color:var(--stamp);background:#F9EDE9;color:#7A3B22;}
.none{margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-2);}
.caveat{margin:10px 0 0;font-size:10.5px;line-height:1.5;color:var(--ink-2);}
.issue{margin-top:11px;padding:10px 12px;font-size:12.5px;line-height:1.5;
  border-left:3px solid var(--stamp);background:#F9EDE9;color:#7A3B22;}
.issue-tag{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.2em;text-transform:uppercase;color:var(--stamp);margin-bottom:3px;}
.summary{margin:0 0 11px;font-family:'Courier Prime',monospace;font-size:12px;line-height:1.65;
  color:var(--ink);background:#FBFAF6;border:1px solid var(--rule);padding:12px 14px;
  white-space:pre-wrap;word-break:break-word;}
@media (max-width:700px){
  .sheet{padding:10px;}
  .block{padding:12px 14px 16px;}
  .masthead{padding:14px 14px 12px;}
  .map-row{grid-template-columns:1fr;gap:2px;}
  .tbl thead th,.tbl tbody th,.tbl tbody td{font-size:11.5px;}
}
`;
