'use client';

import React, { useMemo } from 'react';

/**
 * The analysis half of the reporting page.
 *
 * Shared by both modes. An uploaded export and an API pull produce the same
 * row shape, so the day-of-week, fatigue and anomaly work is written once
 * here rather than diverging into two copies that slowly disagree.
 *
 * Rows: { date (ISO or null), campaign, creative, impressions, clicks,
 *         spend, leads, conversions }
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function totalsOf(rows = []) {
  const t = rows.reduce(
    (a, r) => ({
      impressions: a.impressions + (r.impressions || 0),
      clicks: a.clicks + (r.clicks || 0),
      spend: a.spend + (r.spend || 0),
      leads: a.leads + (r.leads || 0),
      conversions: a.conversions + (r.conversions || 0),
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

export default function AnalysisView({ rows, currency = '$', totals: given = null }) {
  const totals = useMemo(() => given || totalsOf(rows), [given, rows]);

  const dated = useMemo(() => {
    if (!rows?.length) return null;
    const out = rows
      .filter((r) => r.date)
      .map((r) => {
        const d = new Date(`${r.date}T00:00:00Z`);
        return { ...r, d, dow: d.getUTCDay() };
      });
    return out.length ? out : null;
  }, [rows]);

  const range = useMemo(() => {
    if (!dated) return null;
    const days = [...new Set(dated.map((r) => r.date))].sort();
    return { from: days[0], to: days[days.length - 1], days: days.length };
  }, [dated]);

  const campaigns = useMemo(
    () => (rows?.length ? new Set(rows.map((r) => r.campaign)).size : 0),
    [rows]
  );

  /* ---------- day of week ---------- */
  const dow = useMemo(() => {
    if (!dated) return null;
    const buckets = DAY_NAMES.map(() => ({ spend: 0, clicks: 0, leads: 0, impressions: 0 }));
    for (const r of dated) {
      const b = buckets[r.dow];
      b.spend += r.spend || 0;
      b.clicks += r.clicks || 0;
      b.leads += r.leads || 0;
      b.impressions += r.impressions || 0;
    }
    const totalSpend = buckets.reduce((n, b) => n + b.spend, 0);
    const totalLeads = buckets.reduce((n, b) => n + b.leads, 0);
    const totalClicks = buckets.reduce((n, b) => n + b.clicks, 0);
    const useLeads = totalLeads > 0;
    const outcomeTotal = useLeads ? totalLeads : totalClicks;

    const rowsOut = [1, 2, 3, 4, 5, 6, 0].map((i) => {
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
      rows: rowsOut,
      useLeads,
      wsPct,
      woPct,
      wasted: wsPct > woPct ? weekendSpend * (1 - woPct / Math.max(wsPct, 0.01)) : 0,
    };
  }, [dated]);

  /* ---------- fatigue: first half vs second half CTR ---------- */
  const fatigue = useMemo(() => {
    if (!dated) return null;
    const times = dated.map((r) => r.d.getTime());
    const mid = (Math.min(...times) + Math.max(...times)) / 2;
    const groups = new Map();
    for (const r of dated) {
      const key = r.creative || r.campaign;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const out = [];
    for (const [name, list] of groups) {
      const first = list.filter((r) => r.d.getTime() <= mid);
      const second = list.filter((r) => r.d.getTime() > mid);
      const imp1 = first.reduce((n, r) => n + (r.impressions || 0), 0);
      const imp2 = second.reduce((n, r) => n + (r.impressions || 0), 0);
      if (imp1 < 500 || imp2 < 500) continue;
      const ctr1 = (first.reduce((n, r) => n + (r.clicks || 0), 0) / imp1) * 100;
      const ctr2 = (second.reduce((n, r) => n + (r.clicks || 0), 0) / imp2) * 100;
      if (!ctr1) continue;
      out.push({ name, ctr1, ctr2, change: ((ctr2 - ctr1) / ctr1) * 100, imp: imp1 + imp2 });
    }
    return out.sort((a, b) => a.change - b.change);
  }, [dated]);

  /* ---------- anomalies: daily cost per outcome beyond 2 sd ---------- */
  const anomalies = useMemo(() => {
    if (!dated) return null;
    const byDay = new Map();
    for (const r of dated) {
      if (!byDay.has(r.date)) byDay.set(r.date, { spend: 0, clicks: 0, leads: 0 });
      const d = byDay.get(r.date);
      d.spend += r.spend || 0;
      d.clicks += r.clicks || 0;
      d.leads += r.leads || 0;
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
  }, [dated]);

  const money = (n, dp = 2) =>
    currency +
    (n || 0).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const num = (n) => Math.round(n || 0).toLocaleString('en-GB');
  const dstr = (iso) =>
    iso
      ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : 'no date';

  const summary = useMemo(() => {
    if (!totals) return '';
    const lines = [
      `PERFORMANCE SUMMARY. ${range ? `${dstr(range.from)} to ${dstr(range.to)}` : 'Aggregated export, no dates.'}`,
      '',
      `Spend ${money(totals.spend, 0)} across ${campaigns} campaign(s)${range ? ` over ${range.days} days` : ''}.`,
      `${num(totals.impressions)} impressions, ${num(totals.clicks)} clicks (${totals.ctr.toFixed(2)}% CTR), ${money(totals.cpc)} CPC, ${money(totals.cpm)} CPM.`,
      totals.leads ? `${num(totals.leads)} leads at ${money(totals.cpl)} cost per lead.` : '',
      '',
      dow && dow.wasted > 0
        ? `Weekends took ${dow.wsPct.toFixed(1)}% of spend but produced ${dow.woPct.toFixed(1)}% of ${dow.useLeads ? 'leads' : 'clicks'}, roughly ${money(dow.wasted, 0)} underperforming. A weekday-only schedule is worth testing.`
        : dow
          ? 'No material weekend waste in this period.'
          : '',
      fatigue && fatigue.filter((f) => f.change < -20).length
        ? `Fatigue: ${fatigue.filter((f) => f.change < -20).length} creative(s) lost more than 20% of CTR between the first and second half of the period.`
        : '',
      anomalies && anomalies.flagged.length
        ? `${anomalies.flagged.length} day(s) fell outside two standard deviations on cost per ${anomalies.useLeads ? 'lead' : 'click'}.`
        : '',
    ];
    return lines.filter(Boolean).join('\n');
  }, [totals, dow, fatigue, anomalies, currency, range, campaigns]);

  if (!rows?.length) return null;

  return (
    <>
      {/* ---------------- totals ---------------- */}
      <section className="block">
        <div className="block-head">
          Totals
          <span className="range">
            {range ? `${dstr(range.from)} to ${dstr(range.to)}, ${range.days} days` : 'aggregated'}
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

      {!dated && (
        <section className="block">
          <div className="block-head">Day of week, fatigue and anomalies</div>
          <p className="none">
            This data is aggregated, one row per campaign with no dates. Re-export with a daily
            breakdown to get the dayparting case, creative fatigue and daily anomalies.
          </p>
        </section>
      )}

      {dated && (
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
                      <td>{r.cost ? money(r.cost) : 'none'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={`verdict ${dow.wasted > 0 ? 'warn' : 'ok'}`}>
              {dow.wasted > 0
                ? `Weekends absorbed ${dow.wsPct.toFixed(1)}% of spend and returned ${dow.woPct.toFixed(1)}% of ${dow.useLeads ? 'leads' : 'clicks'}. Roughly ${money(dow.wasted, 0)} underperformed over this period. That is the number to put in front of a client when proposing a schedule.`
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
                    <tr key={f.name} className={f.change < -20 ? 'poor' : f.change > 10 ? 'good' : ''}>
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
              A halving of the period is a blunt instrument, but it survives the sparse daily data
              most accounts produce. Treat a drop beyond 20% as worth rotating, not as proof.
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
        </>
      )}

      {/* ---------------- summary ---------------- */}
      <section className="block">
        <div className="block-head">Client summary</div>
        <pre className="summary">{summary}</pre>
        <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(summary)}>
          Copy summary
        </button>
      </section>
    </>
  );
}
