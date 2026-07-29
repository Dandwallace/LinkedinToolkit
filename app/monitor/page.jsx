'use client';

import { useEffect, useMemo, useState } from 'react';

/* LinkedIn caps reach reporting at a 92-day window, and reach cannot be
 * summed across windows — so these are the only ranges offered. */
const RANGES = [7, 14, 30, 60, 90];

/* B2B tolerates far higher frequency than consumer platforms: 7–12 over a
 * 30-day window is normal for tighter ABM campaigns. These bands are scaled
 * to the window rather than fixed, or a 7-day view would look alarming. */
function frequencyVerdict(freq, days) {
  if (freq == null) return null;
  const perThirty = freq * (30 / days);
  if (perThirty < 2) return { level: 'low', text: 'Barely landing. Most people are seeing this once and forgetting it.' };
  if (perThirty <= 12) return { level: 'ok', text: 'Within the normal B2B range.' };
  if (perThirty <= 20) return { level: 'warn', text: 'Heavy. Watch for engagement decay and negative feedback.' };
  return { level: 'high', text: 'Saturated. The audience is too small for this budget — broaden it or cap frequency.' };
}

export default function MonitorPage() {
  const [accounts, setAccounts] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [account, setAccount] = useState('');
  const [days, setDays] = useState(30);
  const [cap, setCap] = useState('');
  const [data, setData] = useState(null);
  const [mtd, setMtd] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState('£');

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
    setLoading(true); setData(null); setMtd(null);
    try {
      const [rRes, aRes] = await Promise.all([
        fetch(`/api/linkedin/reach?account=${encodeURIComponent(account)}&days=${days}`),
        fetch(`/api/linkedin/analytics?account=${encodeURIComponent(account)}&days=31`),
      ]);
      const r = await rRes.json();
      const a = await aRes.json();
      if (!rRes.ok) { setApiError(r.error); setLoading(false); return; }
      setApiError(null);
      setData(r);

      /* Month-to-date pacing from the daily rows we already have. */
      if (aRes.ok && a.rows?.length) {
        const now = new Date();
        const monthPrefix = now.toISOString().slice(0, 7);
        const spend = a.rows.filter((x) => x.date.startsWith(monthPrefix))
          .reduce((n, x) => n + x.spend, 0);
        const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
        setMtd({ spend, dayOfMonth: now.getUTCDate(), daysInMonth });
      }
    } catch (err) { setApiError(err.message); }
    setLoading(false);
  };

  const pacing = useMemo(() => {
    const capNum = Number(cap) || 0;
    if (!mtd || !capNum) return null;
    const elapsed = mtd.dayOfMonth / mtd.daysInMonth;
    const expected = capNum * elapsed;
    const pace = expected ? mtd.spend / expected : 0;
    const projected = elapsed ? mtd.spend / elapsed : 0;
    return {
      ...mtd, cap: capNum, expected, pace, projected, elapsed,
      level: pace > 1.15 ? 'over' : pace < 0.85 ? 'under' : 'ok',
    };
  }, [mtd, cap]);

  const money = (n, dp = 0) =>
    currency + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const num = (n) => Math.round(n || 0).toLocaleString('en-GB');

  return (
    <div className="sheet">
      <header className="masthead">
        <div>
          <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
          <h1 className="mast-title">Monitor</h1>
          <div className="linked">Budget pacing and frequency — the two that go wrong quietly</div>
        </div>
        <dl className="mast-meta"><dt>Form</dt><dd>LA-13</dd></dl>
      </header>

      {apiError && (
        <div className="mo-alert">
          <strong>Not connected.</strong> {apiError}
        </div>
      )}

      <div className="mo-controls">
        <label className="mo-field">
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
        <label className="mo-field narrow">
          <span>Window</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <label className="mo-field narrow">
          <span>Monthly cap</span>
          <input type="number" value={cap} placeholder="10000" onChange={(e) => setCap(e.target.value)} />
        </label>
        <label className="mo-field narrow">
          <span>Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['£', '€', '$'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={load} disabled={!account || loading}>
          {loading ? 'Loading…' : 'Check'}
        </button>
      </div>

      {(pacing || data) && (
        <div className="mo-body">
          {pacing && (
            <section className="mo-block">
              <div className="mo-head">
                Budget pacing
                <span className="mo-sub">day {pacing.dayOfMonth} of {pacing.daysInMonth}</span>
              </div>
              <div className="mo-pace">
                <div className="mo-track">
                  <div className="mo-expected" style={{ left: `${Math.min(100, pacing.elapsed * 100)}%` }} />
                  <div className={`mo-fill ${pacing.level}`}
                    style={{ width: `${Math.min(100, (pacing.spend / pacing.cap) * 100)}%` }} />
                </div>
                <div className="mo-pace-nums">
                  <div><span>Spent</span><strong>{money(pacing.spend)}</strong></div>
                  <div><span>Expected by now</span><strong>{money(pacing.expected)}</strong></div>
                  <div><span>Projected month</span>
                    <strong className={pacing.level}>{money(pacing.projected)}</strong></div>
                  <div><span>Cap</span><strong>{money(pacing.cap)}</strong></div>
                </div>
              </div>
              <p className={`mo-verdict ${pacing.level}`}>
                {pacing.level === 'over'
                  ? `Pacing ${Math.round((pacing.pace - 1) * 100)}% hot. On track for ${money(pacing.projected)} against a ${money(pacing.cap)} cap — roughly ${money(pacing.projected - pacing.cap)} over.`
                  : pacing.level === 'under'
                    ? `Pacing ${Math.round((1 - pacing.pace) * 100)}% cold. On track for ${money(pacing.projected)}, leaving about ${money(pacing.cap - pacing.projected)} unspent.`
                    : 'On pace. Projected spend lands within 15% of the cap.'}
              </p>
              <p className="mo-note">
                Pro-rated against how far through the month you are, not a flat cap check —
                a flat check only fires once the money is already gone. The daily cron at{' '}
                <code>/api/cron/spend-alarm</code> runs this against every account in{' '}
                <code>config/budgets.json</code>.
              </p>
            </section>
          )}

          {data?.unavailable && (
            <section className="mo-block">
              <div className="mo-head">Frequency</div>
              <p className="mo-verdict warn">{data.unavailable}</p>
            </section>
          )}

          {data?.rows && (
            <section className="mo-block">
              <div className="mo-head">
                Frequency
                <span className="mo-sub">{days}-day window · impressions per person reached</span>
              </div>
              <table className="mo-tbl">
                <thead>
                  <tr>
                    <th>Campaign</th><th>Spend</th><th>Impressions</th>
                    <th>Reach</th><th>Freq</th><th>Per 30d</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const v = frequencyVerdict(r.frequency, days);
                    return (
                      <tr key={r.campaignId} className={v?.level === 'warn' || v?.level === 'high' ? 'poor' : ''}>
                        <th>{r.campaign}</th>
                        <td>{money(r.spend)}</td>
                        <td>{num(r.impressions)}</td>
                        <td>{r.reach ? num(r.reach) : '—'}</td>
                        <td>{r.frequency ? r.frequency.toFixed(1) : '—'}</td>
                        <td className={v?.level}>
                          {r.frequency ? (r.frequency * (30 / days)).toFixed(1) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(() => {
                const worst = data.rows
                  .map((r) => ({ r, v: frequencyVerdict(r.frequency, days) }))
                  .filter((x) => x.v && (x.v.level === 'warn' || x.v.level === 'high'))
                  .sort((a, b) => b.r.frequency - a.r.frequency)[0];
                return worst ? (
                  <p className="mo-verdict warn">
                    <strong>{worst.r.campaign}</strong> — {worst.v.text}
                  </p>
                ) : (
                  <p className="mo-verdict ok">No campaign is over-serving its audience.</p>
                );
              })()}
              <p className="mo-note">
                Reach is approximate by design, to protect member privacy, and cannot be summed
                across windows — so this queries the exact range rather than adding up days.
                LinkedIn does not report reach beyond 92 days, and never per company, so
                frequency stops at campaign level. 7–12 per 30 days is normal for B2B;
                consumer benchmarks of 3–4 do not apply.
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
.mo-alert{max-width:1000px;margin:0 auto;background:#F7E9C8;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);border-bottom:1px solid var(--rule-2);padding:11px 22px;
  font-size:13px;color:#7A3B22;}
.mo-controls{max-width:1000px;margin:0 auto;background:#F3F2EC;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);border-bottom:1px solid var(--rule);padding:12px 22px;
  display:flex;align-items:flex-end;gap:11px;flex-wrap:wrap;}
.mo-field span{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:600;
  font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-2);margin-bottom:4px;}
.mo-field input,.mo-field select{font-family:'Courier Prime',monospace;font-size:12.5px;
  color:var(--carbon);background:var(--white);border:1px solid var(--rule);padding:6px 8px;
  border-radius:0;outline:none;min-width:190px;}
.mo-field.narrow input,.mo-field.narrow select{min-width:0;width:104px;}
.mo-field input:focus,.mo-field select:focus{border-color:var(--carbon);}

.mo-body{max-width:1000px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-top:none;}
.mo-block{padding:14px 22px 18px;border-bottom:1px solid var(--rule);}
.mo-block:last-child{border-bottom:none;}
.mo-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11px;
  letter-spacing:.15em;text-transform:uppercase;margin-bottom:12px;}
.mo-sub{font-family:'Courier Prime',monospace;font-size:11px;letter-spacing:0;
  text-transform:none;font-weight:400;color:var(--ink-2);}

.mo-track{position:relative;height:14px;background:#E6E4DA;margin-bottom:10px;}
.mo-fill{height:100%;background:var(--carbon);}
.mo-fill.over{background:var(--stamp);}
.mo-fill.under{background:var(--amber);}
.mo-expected{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink);z-index:2;}
.mo-pace-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;}
.mo-pace-nums span{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);margin-bottom:2px;}
.mo-pace-nums strong{font-family:'Courier Prime',monospace;font-size:17px;color:var(--carbon);}
.mo-pace-nums strong.over{color:var(--stamp);}
.mo-pace-nums strong.under{color:var(--amber);}

.mo-tbl{width:100%;border-collapse:collapse;}
.mo-tbl thead th{text-align:right;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-2);
  padding:5px 8px 6px 0;border-bottom:1px solid var(--rule);}
.mo-tbl thead th:first-child{text-align:left;}
.mo-tbl tbody th{text-align:left;font-weight:500;font-size:12.5px;color:var(--ink);
  padding:6px 8px 6px 0;border-bottom:1px dotted var(--rule);word-break:break-word;}
.mo-tbl tbody td{text-align:right;font-family:'Courier Prime',monospace;font-size:12.5px;
  color:var(--ink-2);padding:6px 0 6px 8px;border-bottom:1px dotted var(--rule);}
.mo-tbl tbody tr.poor th,.mo-tbl tbody tr.poor td{background:#F9EDE9;}
.mo-tbl td.warn{color:var(--amber);font-weight:700;}
.mo-tbl td.high{color:var(--stamp);font-weight:700;}
.mo-tbl td.low{color:var(--ink-2);}
.mo-tbl td.ok{color:var(--ok);}

.mo-verdict{margin:12px 0 0;font-size:12.5px;line-height:1.55;padding:9px 11px;
  border-left:3px solid var(--ok);background:#EFF3ED;color:#255740;}
.mo-verdict.over,.mo-verdict.warn{border-left-color:var(--stamp);background:#F9EDE9;color:#7A3B22;}
.mo-verdict.under{border-left-color:var(--amber);background:#F7EFD9;color:#7A5A18;}
.mo-note{margin:10px 0 0;font-size:10.5px;line-height:1.6;color:var(--ink-2);}
.mo-note code{background:#F3F2EC;padding:1px 5px;font-family:'Courier Prime',monospace;font-size:10px;}

@media (max-width:640px){
  .mo-controls{padding:12px 14px;}
  .mo-block{padding:12px 14px 16px;}
}
`;
