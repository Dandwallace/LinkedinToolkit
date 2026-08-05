'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { parseExportFile } from '@/lib/parse-export';
import { CLIENTS, saveClientData } from '@/lib/client-store';

/* Parsing lives in lib/parse-export.js — the dashboard and this page have
 * to agree on what a Campaign Manager export means, and two copies of the
 * column rules would drift apart within a month. */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PerformanceAnalyser() {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [currency, setCurrency] = useState('£');
  const [client, setClient] = useState(CLIENTS[0].id);
  const [savedTo, setSavedTo] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSavedTo(null);
    try {
      const result = await parseExportFile(file);
      if (!result.ok) {
        setParsed(null);
        setError(result.error);
      } else {
        setParsed(result);
      }
    } catch (err) {
      setParsed(null);
      setError(`Could not read that file: ${err.message}`);
    }
    setBusy(false);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const save = async () => {
    try {
      await saveClientData(client, parsed);
      setSavedTo(CLIENTS.find((c) => c.id === client).name);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
  };

  /* ---------- records: the dated rows, for the time-based sections ---------- */
  const records = useMemo(() => {
    if (!parsed?.ok) return null;
    const out = parsed.rows
      .filter((r) => r.date)
      .map((r) => {
        const d = new Date(`${r.date}T00:00:00Z`);
        return { ...r, d, dow: d.getUTCDay() };
      });
    return out.length ? out : null;
  }, [parsed]);

  const totals = parsed?.ok ? parsed.totals : null;

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
    if (!records) return null;
    const times = records.map((r) => r.d.getTime());
    const mid = (Math.min(...times) + Math.max(...times)) / 2;
    const groups = new Map();
    for (const r of records) {
      const key = r.creative || r.campaign;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const out = [];
    for (const [name, rows] of groups) {
      const first = rows.filter((r) => r.d.getTime() <= mid);
      const second = rows.filter((r) => r.d.getTime() > mid);
      const imp1 = first.reduce((n, r) => n + r.impressions, 0);
      const imp2 = second.reduce((n, r) => n + r.impressions, 0);
      if (imp1 < 500 || imp2 < 500) continue;
      const ctr1 = (first.reduce((n, r) => n + r.clicks, 0) / imp1) * 100;
      const ctr2 = (second.reduce((n, r) => n + r.clicks, 0) / imp2) * 100;
      if (!ctr1) continue;
      out.push({ name, ctr1, ctr2, change: ((ctr2 - ctr1) / ctr1) * 100, imp: imp1 + imp2 });
    }
    return out.sort((a, b) => a.change - b.change);
  }, [records]);

  /* ---------- anomalies: daily cost per outcome beyond 2 sd ---------- */
  const anomalies = useMemo(() => {
    if (!records) return null;
    const byDay = new Map();
    for (const r of records) {
      if (!byDay.has(r.date)) byDay.set(r.date, { spend: 0, clicks: 0, leads: 0, impressions: 0 });
      const d = byDay.get(r.date);
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
  const dstr = (iso) =>
    iso
      ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  const summary = useMemo(() => {
    if (!totals || !parsed?.ok) return '';
    const lines = [
      `PERFORMANCE SUMMARY — ${parsed.from ? `${dstr(parsed.from)} to ${dstr(parsed.to)}` : 'aggregated export, no dates'}`,
      '',
      `Spend ${money(totals.spend, 0)} across ${parsed.campaigns.length} campaign(s)${parsed.days ? ` over ${parsed.days} days` : ''}.`,
      `${num(totals.impressions)} impressions, ${num(totals.clicks)} clicks (${totals.ctr.toFixed(2)}% CTR), ${money(totals.cpc)} CPC, ${money(totals.cpm)} CPM.`,
      totals.leads ? `${num(totals.leads)} leads at ${money(totals.cpl)} cost per lead.` : '',
      '',
      dow && dow.wasted > 0
        ? `Weekends took ${dow.wsPct.toFixed(1)}% of spend but produced ${dow.woPct.toFixed(1)}% of ${dow.useLeads ? 'leads' : 'clicks'} — roughly ${money(dow.wasted, 0)} underperforming. A weekday-only schedule is worth testing.`
        : dow
          ? 'No material weekend waste in this period.'
          : '',
      '',
      fatigue && fatigue.filter((f) => f.change < -20).length
        ? `Fatigue: ${fatigue.filter((f) => f.change < -20).length} creative(s) lost more than 20% of CTR between the first and second half of the period.`
        : '',
      anomalies && anomalies.flagged.length
        ? `${anomalies.flagged.length} day(s) fell outside two standard deviations on cost per ${anomalies.useLeads ? 'lead' : 'click'}.`
        : '',
    ];
    return lines.filter(Boolean).join('\n');
  }, [totals, dow, fatigue, anomalies, currency, parsed]);

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">CSV analysis</h1>
            <div className="linked">Drop a Campaign Manager export in — nothing leaves this browser</div>
          </div>
          <dl className="mast-meta">
            <div>
              <dt>Form</dt>
              <dd>LA-08</dd>
            </div>
            {parsed?.ok && (
              <div>
                <dt>Rows</dt>
                <dd>{parsed.rows.length}</dd>
              </div>
            )}
          </dl>
        </header>

        <div className="body">
          {/* ---------------- upload ---------------- */}
          <section className="block input-block">
            <div className="block-head">
              Upload export
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

            <div
              className={`drop${dragging ? ' over' : ''}${busy ? ' busy' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="drop-main">
                {busy ? 'Reading…' : dragging ? 'Drop it' : 'Drop the export here'}
              </span>
              <span className="drop-sub">
                or click to choose a file · .csv, .tsv or the .xls Campaign Manager produces
              </span>
              <span className="drop-note">
                The native export is tab-separated UTF-16 with metadata lines above the header.
                That is handled — do not open and re-save it first.
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xls,text/csv,text/plain"
                className="drop-input"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>

            {error && (
              <div className="issue blocker">
                <span className="issue-tag">Could not read</span>
                {error}
              </div>
            )}
          </section>

          {parsed?.ok && (
            <>
              {/* ---------------- what was parsed ---------------- */}
              <section className="block">
                <div className="block-head">
                  What was parsed
                  <span className="range">{parsed.filename}</span>
                </div>
                <div className="stats">
                  {[
                    ['Encoding', parsed.encoding],
                    ['Delimiter', parsed.delimiter],
                    ['Header on line', String(parsed.metadataLines + 1)],
                    ['Granularity', parsed.granularity],
                    ['Rows', num(parsed.rows.length)],
                    ['Campaigns', num(parsed.campaigns.length)],
                    ['Days', parsed.days ? num(parsed.days) : '—'],
                    ['Range', parsed.from ? `${parsed.from} → ${parsed.to}` : '—'],
                  ].map(([l, v]) => (
                    <div className="stat" key={l}>
                      <span className="stat-lab">{l}</span>
                      <span className="stat-val sm">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="found">
                  <span className="found-lab">Columns matched</span>
                  <span className="found-list">
                    {parsed.columns.map((c) => (
                      <span className="tag" key={c}>
                        {c}
                      </span>
                    ))}
                  </span>
                </div>

                {parsed.preamble.length > 0 && (
                  <div className="found">
                    <span className="found-lab">Skipped above the header</span>
                    <span className="found-list mono">
                      {parsed.preamble.map((p, i) => (
                        <span key={i} className="pre-line">
                          {p}
                        </span>
                      ))}
                    </span>
                  </div>
                )}

                {parsed.undated > 0 && (
                  <p className="caveat">
                    {parsed.undated} row{parsed.undated === 1 ? '' : 's'} carried no readable date.
                    They count towards the totals but are left out of the day-of-week, fatigue and
                    anomaly sections.
                  </p>
                )}

                {/* ---------------- save against a client ---------------- */}
                <div className="save-row">
                  <span className="save-lab">Save against</span>
                  <select
                    className="save-sel"
                    value={client}
                    onChange={(e) => {
                      setClient(e.target.value);
                      setSavedTo(null);
                    }}
                  >
                    {CLIENTS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn" onClick={save}>
                    Save
                  </button>
                  {savedTo && (
                    <span className="saved">
                      Saved to {savedTo} — health now shows on the dashboard. Saving again replaces
                      it rather than adding to it.
                    </span>
                  )}
                </div>
              </section>

              {/* ---------------- totals ---------------- */}
              <section className="block">
                <div className="block-head">
                  Totals
                  <span className="range">
                    {parsed.from
                      ? `${dstr(parsed.from)} — ${dstr(parsed.to)} · ${parsed.days} days`
                      : 'aggregated export'}
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

              {!records && (
                <section className="block">
                  <div className="block-head">Day of week, fatigue and anomalies</div>
                  <p className="none">
                    This export is aggregated — one row per campaign, no dates. Re-export with a
                    daily breakdown to get the dayparting case, creative fatigue and daily
                    anomalies.
                  </p>
                </section>
              )}

              {records && (
                <>
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
                        Not enough volume to compare halves. Each item needs 500+ impressions in
                        both halves of the period.
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
                      A halving of the period is a blunt instrument, but it survives the sparse
                      daily data most accounts produce. Treat a drop beyond 20% as worth rotating,
                      not as proof.
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
                      <p className="none">
                        Needs at least seven days of data to establish a baseline.
                      </p>
                    )}
                    {!anomalies?.tooShort && !anomalies?.flagged.length && (
                      <p className="none">
                        Nothing beyond two standard deviations. Mean {money(anomalies.mean)},
                        standard deviation {money(anomalies.sd)}.
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
                </>
              )}

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
.drop{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;
  padding:30px 20px;border:2px dashed var(--rule);background:var(--white);cursor:pointer;
  transition:background .12s,border-color .12s;}
.drop:hover{border-color:var(--carbon);background:#F8F7FC;}
.drop.over{border-color:var(--carbon);background:#EDECF6;border-style:solid;}
.drop.busy{opacity:.6;cursor:default;}
.drop:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.drop-main{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:15px;
  letter-spacing:.08em;text-transform:uppercase;color:var(--carbon);}
.drop-sub{font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--ink-2);}
.drop-note{font-size:10.5px;line-height:1.5;color:var(--ink-2);max-width:420px;margin-top:4px;}
.drop-input{display:none;}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));
  border-top:1px solid var(--rule);border-left:1px solid var(--rule);}
.stat{padding:10px 12px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);}
.stat-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);margin-bottom:3px;}
.stat-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:17px;color:var(--carbon);}
.stat-val.sm{font-size:12.5px;font-weight:400;color:var(--ink);word-break:break-word;}
.found{display:flex;gap:12px;align-items:baseline;margin-top:11px;flex-wrap:wrap;}
.found-lab{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);width:150px;flex:none;}
.found-list{display:flex;flex-wrap:wrap;gap:4px;flex:1;min-width:200px;}
.found-list.mono{flex-direction:column;gap:2px;}
.tag{font-family:'Courier Prime',monospace;font-size:11px;color:var(--carbon);
  border:1px solid var(--rule);padding:1px 6px;background:#FBFAF6;}
.pre-line{font-family:'Courier Prime',monospace;font-size:11px;color:var(--ink-2);}
.save-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:14px;
  padding-top:12px;border-top:1px solid var(--rule);}
.save-lab{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);}
.save-sel{font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--carbon);
  background:var(--white);border:1px solid var(--rule);padding:6px 8px;border-radius:0;}
.save-sel:focus-visible{outline:2px solid var(--carbon);outline-offset:1px;}
.saved{font-size:11.5px;line-height:1.5;color:#255740;flex:1;min-width:220px;}
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
  .found-lab{width:auto;}
  .tbl thead th,.tbl tbody th,.tbl tbody td{font-size:11.5px;}
}
`;
