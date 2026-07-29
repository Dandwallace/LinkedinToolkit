'use client';

import { useEffect, useMemo, useState } from 'react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ReportingPage() {
  const [accounts, setAccounts] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [account, setAccount] = useState('');
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState('£');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/linkedin/accounts');
        const data = await res.json();
        if (!res.ok) { setApiError(data.error || 'Could not reach LinkedIn'); return; }
        setAccounts(data.accounts);
        if (data.accounts?.length === 1) setAccount(String(data.accounts[0].id));
      } catch (err) {
        setApiError(err.message);
      }
    })();
  }, []);

  const load = async () => {
    if (!account) return;
    setLoading(true);
    setRows(null);
    try {
      const res = await fetch(`/api/linkedin/analytics?account=${encodeURIComponent(account)}&days=${days}`);
      const data = await res.json();
      if (!res.ok) { setApiError(data.error); setLoading(false); return; }
      setApiError(null);
      setRows(data.rows);
    } catch (err) {
      setApiError(err.message);
    }
    setLoading(false);
  };

  const totals = useMemo(() => {
    if (!rows?.length) return null;
    const t = rows.reduce((a, r) => ({
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      spend: a.spend + r.spend,
      leads: a.leads + r.leads,
      conversions: a.conversions + r.conversions,
    }), { impressions: 0, clicks: 0, spend: 0, leads: 0, conversions: 0 });
    return {
      ...t,
      ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
      cpc: t.clicks ? t.spend / t.clicks : 0,
      cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
      cpl: t.leads ? t.spend / t.leads : 0,
      campaigns: new Set(rows.map((r) => r.campaignId)).size,
    };
  }, [rows]);

  /* Day-of-week split — the dayparting business case, from live data. */
  const dow = useMemo(() => {
    if (!rows?.length) return null;
    const buckets = DAY_NAMES.map(() => ({ spend: 0, clicks: 0, leads: 0 }));
    for (const r of rows) {
      const d = new Date(r.date + 'T00:00:00Z').getUTCDay();
      buckets[d].spend += r.spend;
      buckets[d].clicks += r.clicks;
      buckets[d].leads += r.leads;
    }
    const totalSpend = buckets.reduce((n, b) => n + b.spend, 0);
    const totalLeads = buckets.reduce((n, b) => n + b.leads, 0);
    const totalClicks = buckets.reduce((n, b) => n + b.clicks, 0);
    const useLeads = totalLeads > 0;
    const outcomeTotal = useLeads ? totalLeads : totalClicks;

    const out = [1, 2, 3, 4, 5, 6, 0].map((i) => {
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
    const weekendOutcome = useLeads ? buckets[0].leads + buckets[6].leads : buckets[0].clicks + buckets[6].clicks;
    const ws = totalSpend ? (weekendSpend / totalSpend) * 100 : 0;
    const wo = outcomeTotal ? (weekendOutcome / outcomeTotal) * 100 : 0;
    return {
      rows: out, useLeads, ws, wo,
      wasted: ws > wo ? weekendSpend * (1 - wo / Math.max(ws, 0.01)) : 0,
    };
  }, [rows]);

  const money = (n, dp = 2) =>
    currency + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const num = (n) => Math.round(n || 0).toLocaleString('en-GB');

  const downloadCsv = () => {
    if (!rows?.length) return;
    const header = ['date', 'campaign_id', 'campaign_name', 'impressions', 'clicks', 'spend', 'ctr', 'cpc', 'conversions', 'leads', 'cost_per_lead'];
    const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    const lines = [header.join(','), ...rows.map((r) => [
      r.date, r.campaignId, r.campaign, r.impressions, r.clicks, r.spend.toFixed(2),
      r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(3) : 0,
      r.clicks ? (r.spend / r.clicks).toFixed(2) : 0,
      r.conversions, r.leads, r.leads ? (r.spend / r.leads).toFixed(2) : 0,
    ].map(esc).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linkedin-${account}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="sheet">
      <header className="masthead">
        <div>
          <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
          <h1 className="mast-title">Live reporting</h1>
          <div className="linked">Straight from the Ad Analytics API — no manual export</div>
        </div>
        <dl className="mast-meta"><dt>Form</dt><dd>LA-12</dd></dl>
      </header>

      {apiError && (
        <div className="rp-alert">
          <strong>Not connected.</strong> {apiError}
          <div className="rp-alert-sub">
            The CSV analysis tool does the same job from a manual Campaign Manager export
            and needs no credentials.
          </div>
        </div>
      )}

      <div className="rp-controls">
        <label className="rp-field">
          <span>Ad account</span>
          {accounts ? (
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
            </select>
          ) : (
            <input value={account} placeholder="512345678" onChange={(e) => setAccount(e.target.value)} />
          )}
        </label>
        <label className="rp-field narrow">
          <span>Days</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="rp-field narrow">
          <span>Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['£', '€', '$'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={load} disabled={!account || loading}>
          {loading ? 'Loading…' : 'Pull data'}
        </button>
        {rows?.length > 0 && (
          <button type="button" className="btn ghost" onClick={downloadCsv}>Download CSV</button>
        )}
      </div>

      {rows && !rows.length && <p className="rp-empty">No rows returned for that period.</p>}

      {totals && (
        <div className="rp-body">
          <section className="rp-block">
            <div className="rp-head">Totals<span className="rp-sub">{totals.campaigns} campaigns · {days} days</span></div>
            <div className="rp-stats">
              {[
                ['Spend', money(totals.spend, 0)],
                ['Impressions', num(totals.impressions)],
                ['Clicks', num(totals.clicks)],
                ['CTR', totals.ctr.toFixed(2) + '%'],
                ['CPC', money(totals.cpc)],
                ['CPM', money(totals.cpm)],
                ...(totals.leads ? [['Leads', num(totals.leads)], ['CPL', money(totals.cpl)]] : []),
              ].map(([l, v]) => (
                <div className="rp-stat" key={l}>
                  <span className="rp-stat-lab">{l}</span>
                  <span className="rp-stat-val">{v}</span>
                </div>
              ))}
            </div>
          </section>

          {dow && (
            <section className="rp-block">
              <div className="rp-head">Day of week<span className="rp-sub">the dayparting case</span></div>
              <table className="rp-tbl">
                <thead>
                  <tr>
                    <th>Day</th><th>Spend</th><th>% spend</th>
                    <th>{dow.useLeads ? 'Leads' : 'Clicks'}</th><th>% of total</th><th>Cost per</th>
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
              <p className={`rp-verdict ${dow.wasted > 0 ? 'warn' : 'ok'}`}>
                {dow.wasted > 0
                  ? `Weekends took ${dow.ws.toFixed(1)}% of spend and returned ${dow.wo.toFixed(1)}% of ${dow.useLeads ? 'leads' : 'clicks'} — roughly ${money(dow.wasted, 0)} underperforming. Build a schedule in Dayparting.`
                  : 'No material weekend waste. Dayparting would not pay for itself here.'}
              </p>
            </section>
          )}
        </div>
      )}

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.rp-alert{max-width:1000px;margin:0 auto;background:#F7E9C8;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);border-bottom:1px solid var(--rule-2);padding:11px 22px;
  font-size:13px;color:#7A3B22;}
.rp-alert-sub{font-size:12px;margin-top:4px;color:#8A5A3A;}
.rp-controls{max-width:1000px;margin:0 auto;background:#F3F2EC;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);border-bottom:1px solid var(--rule);padding:12px 22px;
  display:flex;align-items:flex-end;gap:11px;flex-wrap:wrap;}
.rp-field{display:block;}
.rp-field.narrow select{width:82px;}
.rp-field span{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:600;
  font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-2);margin-bottom:4px;}
.rp-field input,.rp-field select{font-family:'Courier Prime',monospace;font-size:12.5px;
  color:var(--carbon);background:var(--white);border:1px solid var(--rule);padding:6px 8px;
  border-radius:0;outline:none;min-width:190px;}
.rp-field.narrow input,.rp-field.narrow select{min-width:0;}
.rp-field input:focus,.rp-field select:focus{border-color:var(--carbon);}

.rp-empty{max-width:1000px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-top:none;padding:26px 22px;font-size:13px;color:var(--ink-2);}
.rp-body{max-width:1000px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-top:none;}
.rp-block{padding:14px 22px 18px;border-bottom:1px solid var(--rule);}
.rp-block:last-child{border-bottom:none;}
.rp-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11px;
  letter-spacing:.15em;text-transform:uppercase;margin-bottom:11px;}
.rp-sub{font-family:'Courier Prime',monospace;font-size:11px;letter-spacing:0;
  text-transform:none;font-weight:400;color:var(--ink-2);}

.rp-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));
  border-top:1px solid var(--rule);border-left:1px solid var(--rule);}
.rp-stat{padding:10px 12px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);}
.rp-stat-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);margin-bottom:3px;}
.rp-stat-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:17px;color:var(--carbon);}

.rp-tbl{width:100%;border-collapse:collapse;}
.rp-tbl thead th{text-align:right;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-2);
  padding:5px 8px 6px 0;border-bottom:1px solid var(--rule);}
.rp-tbl thead th:first-child{text-align:left;}
.rp-tbl tbody th{text-align:left;font-weight:500;font-size:12.5px;color:var(--ink);
  padding:5px 8px 5px 0;border-bottom:1px dotted var(--rule);}
.rp-tbl tbody td{text-align:right;font-family:'Courier Prime',monospace;font-size:12.5px;
  color:var(--ink-2);padding:5px 0 5px 8px;border-bottom:1px dotted var(--rule);}
.rp-tbl tbody tr.poor th,.rp-tbl tbody tr.poor td{background:#F9EDE9;color:#7A3B22;}
.rp-tbl tbody tr.good th,.rp-tbl tbody tr.good td{background:#EFF3ED;color:#255740;}
.rp-verdict{margin:11px 0 0;font-size:12.5px;line-height:1.55;padding:9px 11px;
  border-left:3px solid var(--ok);background:#EFF3ED;color:#255740;}
.rp-verdict.warn{border-left-color:var(--stamp);background:#F9EDE9;color:#7A3B22;}

@media (max-width:640px){
  .rp-controls{padding:12px 14px;}
  .rp-block{padding:12px 14px 16px;}
}
`;
