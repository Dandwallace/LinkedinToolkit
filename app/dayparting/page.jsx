'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveDesiredStates, validateConfig, localNow } from '@/lib/linkedin/schedule';

const DAYS = [
  { i: 1, s: 'Mon' }, { i: 2, s: 'Tue' }, { i: 3, s: 'Wed' }, { i: 4, s: 'Thu' },
  { i: 5, s: 'Fri' }, { i: 6, s: 'Sat' }, { i: 0, s: 'Sun' },
];

const TIMEZONES = [
  'Europe/London', 'Europe/Madrid', 'Europe/Berlin', 'Europe/Paris',
  'Europe/Dublin', 'America/New_York', 'America/Los_Angeles', 'UTC',
];

let uid = 0;
const nextId = () => `r${++uid}`;

const blankRule = () => ({
  id: nextId(),
  label: 'New rule',
  enabled: true,
  accountId: '',
  campaignIds: [],
  timezone: 'Europe/London',
  windows: [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' }],
});

export default function DaypartingPage() {
  const [accounts, setAccounts] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [campaigns, setCampaigns] = useState({});
  const [rules, setRules] = useState([blankRule()]);
  const [tick, setTick] = useState(Date.now());

  /* Re-evaluate the preview on the minute so it stays honest. */
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/linkedin/accounts');
        const data = await res.json();
        if (!res.ok) { setApiError(data.error || 'Could not reach LinkedIn'); return; }
        setAccounts(data.accounts);
      } catch (err) {
        setApiError(err.message);
      }
    })();
  }, []);

  const loadCampaigns = async (accountId) => {
    if (!accountId || campaigns[accountId]) return;
    try {
      const res = await fetch(`/api/linkedin/campaigns?account=${encodeURIComponent(accountId)}`);
      const data = await res.json();
      if (res.ok) setCampaigns((p) => ({ ...p, [accountId]: data.campaigns }));
    } catch { /* leave unset; the picker falls back to manual entry */ }
  };

  const setRule = (id, patch) => setRules((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setWindow = (id, wi, patch) =>
    setRules((p) => p.map((r) =>
      r.id === id ? { ...r, windows: r.windows.map((w, i) => (i === wi ? { ...w, ...patch } : w)) } : r
    ));

  const config = useMemo(
    () => ({
      defaultTimezone: 'Europe/London',
      schedules: rules.map(({ id, ...r }) => r),
    }),
    [rules]
  );

  const errors = useMemo(() => validateConfig(config), [config]);
  const preview = useMemo(
    () => (errors.length ? [] : resolveDesiredStates(config, new Date(tick))),
    [config, errors, tick]
  );

  const configJson = JSON.stringify(config, null, 2);

  return (
    <div className="sheet">
      <header className="masthead">
        <div>
          <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
          <h1 className="mast-title">Dayparting</h1>
          <div className="linked">
            LinkedIn has no native delivery scheduling, so this runs every 15 minutes via cron
          </div>
        </div>
      </header>

      {apiError && (
        <div className="dp-alert">
          <strong>Not connected.</strong> {apiError}
          <div className="dp-alert-sub">
            You can still build a schedule below and commit it. The cron job will pick it up
            once credentials are in place.
          </div>
        </div>
      )}

      <div className="dp-body">
        <section className="dp-block">
          <div className="dp-head">
            Rules
            <button type="button" className="btn ghost sm"
              onClick={() => setRules((p) => [...p, blankRule()])}>Add rule</button>
          </div>

          {rules.map((rule) => {
            const list = campaigns[rule.accountId];
            return (
              <article className={`dp-rule${rule.enabled ? '' : ' off'}`} key={rule.id}>
                <div className="dp-rule-top">
                  <input className="dp-label" value={rule.label}
                    onChange={(e) => setRule(rule.id, { label: e.target.value })} />
                  <button type="button"
                    className={rule.enabled ? 'dp-toggle on' : 'dp-toggle'}
                    onClick={() => setRule(rule.id, { enabled: !rule.enabled })}>
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button type="button" className="mini del"
                    onClick={() => setRules((p) => p.filter((r) => r.id !== rule.id))}
                    disabled={rules.length === 1}>Remove</button>
                </div>

                <div className="dp-grid">
                  <label className="dp-field">
                    <span>Ad account</span>
                    {accounts ? (
                      <select value={rule.accountId}
                        onChange={(e) => { setRule(rule.id, { accountId: e.target.value, campaignIds: [] }); loadCampaigns(e.target.value); }}>
                        <option value="">Choose an account</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                        ))}
                      </select>
                    ) : (
                      <input value={rule.accountId} placeholder="512345678"
                        onChange={(e) => setRule(rule.id, { accountId: e.target.value })} />
                    )}
                  </label>

                  <label className="dp-field">
                    <span>Timezone</span>
                    <select value={rule.timezone}
                      onChange={(e) => setRule(rule.id, { timezone: e.target.value })}>
                      {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                </div>

                <div className="dp-field wide">
                  <span>Campaigns</span>
                  {list ? (
                    <div className="dp-camps">
                      {list.map((c) => {
                        const on = rule.campaignIds.includes(String(c.id));
                        return (
                          <button key={c.id} type="button" className={on ? 'dp-camp on' : 'dp-camp'}
                            onClick={() => setRule(rule.id, {
                              campaignIds: on
                                ? rule.campaignIds.filter((x) => x !== String(c.id))
                                : [...rule.campaignIds, String(c.id)],
                            })}>
                            <span className="dp-camp-box">{on ? '×' : ''}</span>
                            {c.name}
                            <em>{c.status}</em>
                          </button>
                        );
                      })}
                      {!list.length && <p className="dp-none">No campaigns in this account.</p>}
                    </div>
                  ) : (
                    <input value={rule.campaignIds.join(', ')}
                      placeholder="987654321, 987654322, comma separated"
                      onChange={(e) => setRule(rule.id, {
                        campaignIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })} />
                  )}
                </div>

                {rule.windows.map((w, wi) => (
                  <div className="dp-window" key={wi}>
                    <div className="dp-days">
                      {DAYS.map((d) => {
                        const on = (w.days ?? []).includes(d.i);
                        return (
                          <button key={d.i} type="button" className={on ? 'dp-day on' : 'dp-day'}
                            onClick={() => setWindow(rule.id, wi, {
                              days: on ? w.days.filter((x) => x !== d.i) : [...(w.days ?? []), d.i],
                            })}>{d.s}</button>
                        );
                      })}
                    </div>
                    <input type="time" value={w.start}
                      onChange={(e) => setWindow(rule.id, wi, { start: e.target.value })} />
                    <span className="dp-to">to</span>
                    <input type="time" value={w.end}
                      onChange={(e) => setWindow(rule.id, wi, { end: e.target.value })} />
                    <button type="button" className="mini del"
                      onClick={() => setRule(rule.id, { windows: rule.windows.filter((_, i) => i !== wi) })}
                      disabled={rule.windows.length === 1}>×</button>
                  </div>
                ))}
                <button type="button" className="chip"
                  onClick={() => setRule(rule.id, {
                    windows: [...rule.windows, { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }],
                  })}>+ Add window</button>
              </article>
            );
          })}
        </section>

        <aside className="dp-side">
          <section className="dp-block">
            <div className="dp-head">Right now</div>
            {errors.length > 0 ? (
              <ul className="dp-errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            ) : !preview.length ? (
              <p className="dp-none">No enabled rules with campaigns.</p>
            ) : (
              <>
                <p className="dp-clock">
                  {rules[0]?.timezone} · {(() => {
                    const { minutes } = localNow(rules[0]?.timezone || 'Europe/London', new Date(tick));
                    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
                  })()}
                </p>
                <ul className="dp-preview">
                  {preview.map((p, i) => (
                    <li key={i} className={p.desired === 'ACTIVE' ? 'on' : 'off'}>
                      <span className="dp-state">{p.desired === 'ACTIVE' ? 'Running' : 'Paused'}</span>
                      <span className="dp-cid">{p.campaignId}</span>
                      <em>{p.label}</em>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="dp-block">
            <div className="dp-head">
              Deploy
              <button type="button" className="btn ghost sm"
                onClick={() => navigator.clipboard?.writeText(configJson)}>Copy JSON</button>
            </div>
            <p className="dp-note">
              The cron job reads a committed file rather than this browser, so schedules stay
              version-controlled and survive a cleared cache. Paste this into{' '}
              <code>config/schedules.json</code> and deploy.
            </p>
            <pre className="dp-json">{configJson}</pre>
            <p className="dp-note">
              Preview a run without changing anything:{' '}
              <code>/api/cron/dayparting?dry=1</code>
            </p>
          </section>
        </aside>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.dp-alert{max-width:1180px;margin:0 auto;background:#F7E9C8;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);border-bottom:1px solid var(--rule-2);padding:11px 22px;
  font-size:13px;color:#7A3B22;}
.dp-alert-sub{font-size:12px;margin-top:4px;color:#8A5A3A;}
.masthead{max-width:1180px;}
.dp-body{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1fr .68fr;
  align-items:start;border:1px solid var(--ink);background:var(--white);}
.dp-side{background:var(--canary);border-left:1px solid var(--ink);align-self:stretch;}
.dp-block{padding:13px 18px 16px;border-bottom:1px solid var(--rule);}
.dp-side .dp-block{border-bottom-color:var(--rule-2);}
.dp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11px;
  letter-spacing:.15em;text-transform:uppercase;color:var(--ink-2);margin-bottom:11px;}
.btn.sm{padding:5px 10px;font-size:9.5px;}

.dp-rule{border:1px solid var(--rule);padding:12px 14px;margin-bottom:10px;}
.dp-rule.off{opacity:.5;}
.dp-rule-top{display:flex;align-items:center;gap:7px;margin-bottom:11px;}
.dp-label{flex:1;font-family:'Archivo',sans-serif;font-weight:600;font-size:14px;
  border:none;border-bottom:1px solid transparent;background:none;padding:2px 0;outline:none;}
.dp-label:hover{border-bottom-color:var(--rule);}
.dp-label:focus{border-bottom-color:var(--carbon);}
.dp-toggle{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;background:none;
  border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;}
.dp-toggle.on{background:var(--ok);color:#fff;border-color:var(--ok);}

.dp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}
.dp-field{display:block;}
.dp-field.wide{margin-bottom:11px;}
.dp-field span{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:600;
  font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-2);margin-bottom:4px;}
.dp-field input,.dp-field select{width:100%;font-family:'Courier Prime',monospace;
  font-size:12.5px;color:var(--carbon);background:#FBFAF6;border:1px solid var(--rule);
  padding:5px 7px;border-radius:0;outline:none;}
.dp-field input:focus,.dp-field select:focus{border-color:var(--carbon);}

.dp-camps{display:flex;flex-direction:column;gap:3px;max-height:150px;overflow-y:auto;
  border:1px solid var(--rule);padding:6px;background:#FBFAF6;}
.dp-camp{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-2);
  background:none;border:none;padding:2px 0;cursor:pointer;text-align:left;}
.dp-camp-box{width:13px;height:13px;flex:none;border:1px solid var(--rule);background:#fff;
  font-family:'Courier Prime',monospace;font-size:12px;line-height:11px;color:var(--carbon);
  text-align:center;}
.dp-camp.on{color:var(--ink);}
.dp-camp.on .dp-camp-box{border-color:var(--carbon);}
.dp-camp em{margin-left:auto;font-style:normal;font-size:9.5px;color:#9A9890;
  letter-spacing:.08em;text-transform:uppercase;}

.dp-window{display:flex;align-items:center;gap:7px;padding:7px 0;
  border-top:1px dotted var(--rule);flex-wrap:wrap;}
.dp-days{display:flex;gap:2px;}
.dp-day{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.06em;text-transform:uppercase;width:28px;padding:5px 0;background:none;
  border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;}
.dp-day.on{background:var(--carbon);color:#fff;border-color:var(--carbon);}
.dp-window input[type=time]{font-family:'Courier Prime',monospace;font-size:12.5px;
  color:var(--carbon);background:#FBFAF6;border:1px solid var(--rule);padding:4px 6px;outline:none;}
.dp-to{font-size:11px;color:var(--ink-2);}

.dp-clock{font-family:'Courier Prime',monospace;font-size:12px;color:#93803C;margin:0 0 8px;}
.dp-preview{list-style:none;margin:0;padding:0;}
.dp-preview li{display:flex;align-items:baseline;gap:9px;padding:5px 0;
  border-bottom:1px dotted var(--rule-2);font-size:12.5px;}
.dp-state{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.13em;text-transform:uppercase;padding:2px 6px;flex:none;}
.dp-preview li.on .dp-state{background:#E6F0E4;color:#255740;}
.dp-preview li.off .dp-state{background:#F7E4C6;color:#7A3B22;}
.dp-cid{font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--ink-2);}
.dp-preview em{margin-left:auto;font-style:normal;font-size:11px;color:#93803C;}

.dp-errors{margin:0;padding-left:16px;color:var(--stamp);font-size:12.5px;line-height:1.6;}
.dp-none{margin:0;font-size:12.5px;color:#8C7C43;}
.dp-note{font-size:11.5px;line-height:1.55;color:#7A6A3E;margin:0 0 9px;}
.dp-note code{background:#F3E9B8;padding:1px 5px;font-family:'Courier Prime',monospace;font-size:11px;}
.dp-json{font-family:'Courier Prime',monospace;font-size:10.5px;line-height:1.5;
  background:#FBFAF6;border:1px solid var(--rule-2);padding:10px;margin:0 0 9px;
  max-height:260px;overflow:auto;white-space:pre;}

@media (max-width:900px){
  .dp-body{grid-template-columns:1fr;}
  .dp-side{border-left:none;border-top:1px solid var(--ink);}
  .dp-grid{grid-template-columns:1fr;}
}
`;
