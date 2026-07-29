'use client';

import { useEffect, useMemo, useState } from 'react';

export default function CompaniesPage() {
  const [accounts, setAccounts] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [account, setAccount] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetList, setTargetList] = useState('');
  const [currency, setCurrency] = useState('£');
  const [sort, setSort] = useState('impressions');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/linkedin/accounts');
        const d = await res.json();
        if (!res.ok) { setApiError(d.error || 'Could not reach LinkedIn'); return; }
        setAccounts(d.accounts);
        if (d.accounts?.length === 1) setAccount(String(d.accounts[0].id));
      } catch (err) { setApiError(err.message); }
    })();
  }, []);

  const load = async () => {
    if (!account) return;
    setLoading(true); setData(null);
    try {
      const res = await fetch(`/api/linkedin/companies?account=${encodeURIComponent(account)}&days=${days}`);
      const d = await res.json();
      if (!res.ok) { setApiError(d.error); setLoading(false); return; }
      setApiError(null);
      setData(d);
    } catch (err) { setApiError(err.message); }
    setLoading(false);
  };

  /* Matching the target list against reported names is the whole point of
   * this page for ABM: it separates "the account list is working" from
   * "we are reaching a lot of people who are not on it". */
  const targets = useMemo(
    () => targetList.split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean),
    [targetList]
  );

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const enriched = data.rows.map((r) => {
      const name = (r.company || '').toLowerCase();
      const onList = targets.length > 0 && name
        ? targets.some((t) => name.includes(t) || t.includes(name))
        : null;
      return { ...r, onList, ctr: r.impressions ? (r.clicks / r.impressions) * 100 : 0 };
    });
    const key = sort;
    return enriched.sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
  }, [data, targets, sort]);

  const totals = useMemo(() => {
    if (!rows.length) return null;
    const t = rows.reduce((a, r) => ({
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      spend: a.spend + r.spend,
      leads: a.leads + r.leads,
    }), { impressions: 0, clicks: 0, spend: 0, leads: 0 });
    const onList = rows.filter((r) => r.onList === true);
    const offList = rows.filter((r) => r.onList === false);
    return {
      ...t,
      companies: rows.length,
      named: rows.filter((r) => r.company).length,
      onListCount: onList.length,
      onListSpend: onList.reduce((n, r) => n + r.spend, 0),
      offListSpend: offList.reduce((n, r) => n + r.spend, 0),
    };
  }, [rows]);

  const money = (n, dp = 0) =>
    currency + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const num = (n) => Math.round(n || 0).toLocaleString('en-GB');

  const exportCsv = () => {
    if (!rows.length) return;
    const head = ['company', 'organization_id', 'on_target_list', 'impressions', 'clicks', 'ctr', 'spend', 'leads'];
    const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    const csv = [head.join(','), ...rows.map((r) => [
      r.company || '', r.organizationId, r.onList === null ? '' : r.onList,
      r.impressions, r.clicks, r.ctr.toFixed(3), r.spend.toFixed(2), r.leads,
    ].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `companies-${account}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="sheet">
      <header className="masthead">
        <div>
          <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
          <h1 className="mast-title">Company engagement</h1>
          <div className="linked">Which companies actually saw and clicked the ads</div>
        </div>
        <dl className="mast-meta"><dt>Form</dt><dd>LA-14</dd></dl>
      </header>

      {apiError && (
        <div className="co-alert"><strong>Not connected.</strong> {apiError}</div>
      )}

      <div className="co-controls">
        <label className="co-field">
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
        <label className="co-field narrow">
          <span>Days</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90, 180].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="co-field narrow">
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="impressions">Impressions</option>
            <option value="clicks">Clicks</option>
            <option value="spend">Spend</option>
            <option value="ctr">CTR</option>
            <option value="leads">Leads</option>
          </select>
        </label>
        <label className="co-field narrow">
          <span>Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['£', '€', '$'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={load} disabled={!account || loading}>
          {loading ? 'Loading…' : 'Pull report'}
        </button>
        {rows.length > 0 && (
          <button type="button" className="btn ghost" onClick={exportCsv}>CSV</button>
        )}
      </div>

      <div className="co-target">
        <label>
          <span>Target account list — one company per line, to check the list is working</span>
          <textarea rows={2} value={targetList} placeholder="Acme Manufacturing&#10;Beta Corp"
            onChange={(e) => setTargetList(e.target.value)} />
        </label>
      </div>

      {data && !rows.length && (
        <p className="co-empty">
          No company data returned. Demographic reporting drops any company with fewer than
          three events and lags 12–24 hours, so a new or low-volume campaign will show nothing yet.
        </p>
      )}

      {totals && (
        <div className="co-body">
          <section className="co-block">
            <div className="co-head">
              Summary
              <span className="co-sub">
                {totals.companies} companies · {totals.named} named
                {data.resolvedNames === 0 && ' · name lookup unavailable'}
              </span>
            </div>
            <div className="co-stats">
              {[
                ['Companies reached', num(totals.companies)],
                ['Impressions', num(totals.impressions)],
                ['Clicks', num(totals.clicks)],
                ['Spend', money(totals.spend)],
                ...(totals.leads ? [['Leads', num(totals.leads)]] : []),
              ].map(([l, v]) => (
                <div className="co-stat" key={l}>
                  <span className="co-stat-lab">{l}</span>
                  <span className="co-stat-val">{v}</span>
                </div>
              ))}
            </div>
            {targets.length > 0 && (
              <p className={`co-verdict ${totals.offListSpend > totals.onListSpend ? 'warn' : 'ok'}`}>
                {totals.onListCount} of {totals.companies} companies matched your target list,
                taking {money(totals.onListSpend)} of {money(totals.spend)}.
                {totals.offListSpend > totals.onListSpend
                  ? ' More spend is going to companies off the list than on it — check Audience Expansion is off and the company list is actually applied.'
                  : ' The list is doing its job.'}
              </p>
            )}
          </section>

          <section className="co-block">
            <div className="co-head">Companies</div>
            <table className="co-tbl">
              <thead>
                <tr>
                  <th>Company</th><th>Impressions</th><th>Clicks</th>
                  <th>CTR</th><th>Spend</th><th>Leads</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((r) => (
                  <tr key={r.organizationId}
                    className={r.onList === true ? 'on' : r.onList === false ? 'off' : ''}>
                    <th>
                      {r.company || <em className="co-urn">Organisation {r.organizationId}</em>}
                      {r.onList === true && <span className="co-tag">on list</span>}
                    </th>
                    <td>{num(r.impressions)}</td>
                    <td>{num(r.clicks)}</td>
                    <td>{r.ctr.toFixed(2)}%</td>
                    <td>{money(r.spend, 2)}</td>
                    <td>{r.leads || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 150 && (
              <p className="co-note">Showing the top 150 of {rows.length}. Export the CSV for all of them.</p>
            )}
            <p className="co-note">
              These figures are approximate by design — LinkedIn blurs demographic reporting to
              protect member privacy. Companies with fewer than three events are dropped entirely,
              only the top 100 values per creative per day are returned, and results can include
              companies you never targeted. Read it as a directional signal about who is seeing
              the work, not an audited list.
            </p>
          </section>
        </div>
      )}

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.co-alert{max-width:1060px;margin:0 auto;background:#F7E9C8;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);border-bottom:1px solid var(--rule-2);padding:11px 22px;
  font-size:13px;color:#7A3B22;}
.co-controls{max-width:1060px;margin:0 auto;background:#F3F2EC;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);border-bottom:1px solid var(--rule);padding:12px 22px;
  display:flex;align-items:flex-end;gap:11px;flex-wrap:wrap;}
.co-field span{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:600;
  font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-2);margin-bottom:4px;}
.co-field input,.co-field select{font-family:'Courier Prime',monospace;font-size:12.5px;
  color:var(--carbon);background:var(--white);border:1px solid var(--rule);padding:6px 8px;
  border-radius:0;outline:none;min-width:190px;}
.co-field.narrow input,.co-field.narrow select{min-width:0;width:104px;}
.co-field input:focus,.co-field select:focus{border-color:var(--carbon);}

.co-target{max-width:1060px;margin:0 auto;background:#F3F2EC;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);border-bottom:1px solid var(--rule);padding:11px 22px 13px;}
.co-target span{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:600;
  font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-2);margin-bottom:5px;}
.co-target textarea{width:100%;font-family:'Courier Prime',monospace;font-size:12px;
  line-height:1.5;color:var(--carbon);background:var(--white);border:1px solid var(--rule);
  padding:7px 9px;border-radius:0;outline:none;resize:vertical;}
.co-target textarea:focus{border-color:var(--carbon);}

.co-empty{max-width:1060px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-top:none;padding:22px;font-size:12.5px;line-height:1.6;color:var(--ink-2);}
.co-body{max-width:1060px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-top:none;}
.co-block{padding:14px 22px 18px;border-bottom:1px solid var(--rule);}
.co-block:last-child{border-bottom:none;}
.co-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11px;
  letter-spacing:.15em;text-transform:uppercase;margin-bottom:11px;}
.co-sub{font-family:'Courier Prime',monospace;font-size:11px;letter-spacing:0;
  text-transform:none;font-weight:400;color:var(--ink-2);}

.co-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));
  border-top:1px solid var(--rule);border-left:1px solid var(--rule);}
.co-stat{padding:10px 12px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);}
.co-stat-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);margin-bottom:3px;}
.co-stat-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:17px;color:var(--carbon);}

.co-tbl{width:100%;border-collapse:collapse;}
.co-tbl thead th{text-align:right;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-2);
  padding:5px 8px 6px 0;border-bottom:1px solid var(--rule);}
.co-tbl thead th:first-child{text-align:left;}
.co-tbl tbody th{text-align:left;font-weight:500;font-size:12.5px;color:var(--ink);
  padding:5px 8px 5px 0;border-bottom:1px dotted var(--rule);word-break:break-word;}
.co-tbl tbody td{text-align:right;font-family:'Courier Prime',monospace;font-size:12px;
  color:var(--ink-2);padding:5px 0 5px 8px;border-bottom:1px dotted var(--rule);}
.co-tbl tbody tr.on th,.co-tbl tbody tr.on td{background:#EFF3ED;}
.co-tbl tbody tr.off th,.co-tbl tbody tr.off td{background:#FBFAF6;}
.co-urn{font-style:normal;color:#9A9890;font-family:'Courier Prime',monospace;font-size:11.5px;}
.co-tag{margin-left:8px;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--ok);border:1px solid var(--ok);
  padding:1px 5px;}

.co-verdict{margin:12px 0 0;font-size:12.5px;line-height:1.55;padding:9px 11px;
  border-left:3px solid var(--ok);background:#EFF3ED;color:#255740;}
.co-verdict.warn{border-left-color:var(--stamp);background:#F9EDE9;color:#7A3B22;}
.co-note{margin:10px 0 0;font-size:10.5px;line-height:1.6;color:var(--ink-2);}

@media (max-width:640px){
  .co-controls,.co-target{padding-left:14px;padding-right:14px;}
  .co-block{padding:12px 14px 16px;}
}
`;
