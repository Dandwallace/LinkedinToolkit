'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

/* LinkedIn's practical floor. Campaigns funded below this either fail to
 * deliver or spend so slowly they never gather enough data to optimise. */
const MIN_DAILY = 10;
const DAYS = 30.4;

/* Opinionated starting structures. Each reflects a different situation,
 * not just a different set of numbers. */
const PRESETS = {
  'Full funnel (cold start)': {
    note: 'Nobody knows the client yet. Weight the top, earn the right to convert later.',
    split: { awareness: 40, consideration: 35, conversion: 25 },
  },
  'Demand generation': {
    note: 'Some brand equity exists. Balanced, with conversion carrying the load.',
    split: { awareness: 20, consideration: 30, conversion: 50 },
  },
  'Account-based (ABM)': {
    note: 'Named account list. Sustained presence across the buying group matters more than volume.',
    split: { awareness: 30, consideration: 30, conversion: 40 },
  },
  'Direct lead gen': {
    note: 'Warm audience, known brand, short cycle. Only viable if retargeting pools already exist.',
    split: { awareness: 10, consideration: 20, conversion: 70 },
  },
};

const STAGE_META = {
  awareness: { label: 'Awareness', hint: 'reach the ICP for the first time' },
  consideration: { label: 'Consideration', hint: 'engage, educate, build the retargeting pool' },
  conversion: { label: 'Conversion', hint: 'capture the lead' },
};

const STARTERS = {
  awareness: [
    { name: 'Thought leader video — ICP', weight: 60 },
    { name: 'Brand awareness — cold ICP', weight: 40 },
  ],
  consideration: [
    { name: 'Document ad — report', weight: 55 },
    { name: 'Retargeting — video engagers', weight: 45 },
  ],
  conversion: [
    { name: 'Lead Gen Form — core ICP', weight: 65 },
    { name: 'Retargeting — site visitors', weight: 35 },
  ],
};

let uid = 0;
const nextId = () => `c${++uid}`;

function buildStages(preset) {
  const split = PRESETS[preset]?.split || PRESETS['Full funnel (cold start)'].split;
  return Object.keys(STAGE_META).map((key) => ({
    key,
    pct: split[key],
    campaigns: STARTERS[key].map((c) => ({ id: nextId(), ...c })),
  }));
}

/* ------------------------------------------------------------------ */

function Row({ label, hint, children }) {
  return (
    <label className="row">
      <span className="row-label">
        {label}
        {hint && <em className="row-hint">{hint}</em>}
      </span>
      {children}
    </label>
  );
}

function Num({ value, onChange, prefix, suffix, w = 90 }) {
  return (
    <span className="nw">
      {prefix && <span className="afx">{prefix}</span>}
      <input
        className="num"
        type="number"
        style={{ width: w }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className="afx suf">{suffix}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export default function BudgetAllocator() {
  const [preset, setPreset] = useState('Full funnel (cold start)');
  const [monthly, setMonthly] = useState('5000');
  const [client, setClient] = useState('');
  const [stages, setStages] = useState(() => buildStages('Full funnel (cold start)'));
  const [linked, setLinked] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (r?.value) {
          const b = JSON.parse(r.value);
          if (b.client) setClient(b.client);
          if (b.budget && b.months) setMonthly(String(Math.round(Number(b.budget) / Number(b.months))));
          if (b.campaignCount) {
            /* keep the client's own campaign count in view rather than
             * silently overriding the starter structure */
          }
          if (b.runningNow === 'No') applyPreset('Full funnel (cold start)');
          else if (b.targetAccountList === 'Yes') applyPreset('Account-based (ABM)');
          if (b.client) setLinked(b.client);
        }
      } catch {
        /* no brief yet */
      }
      loaded.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(p) {
    setPreset(p);
    if (PRESETS[p]) {
      setStages((prev) =>
        prev.map((s) => ({ ...s, pct: PRESETS[p].split[s.key] }))
      );
    }
  }

  const setPct = (key, v) =>
    setStages((prev) => {
      setPreset('Custom');
      return prev.map((s) => (s.key === key ? { ...s, pct: Number(v) || 0 } : s));
    });

  const setCampaign = (stageKey, id, patch) =>
    setStages((prev) =>
      prev.map((s) =>
        s.key === stageKey
          ? { ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
          : s
      )
    );

  const addCampaign = (stageKey) =>
    setStages((prev) =>
      prev.map((s) =>
        s.key === stageKey
          ? { ...s, campaigns: [...s.campaigns, { id: nextId(), name: 'New campaign', weight: 25 }] }
          : s
      )
    );

  const removeCampaign = (stageKey, id) =>
    setStages((prev) =>
      prev.map((s) =>
        s.key === stageKey ? { ...s, campaigns: s.campaigns.filter((c) => c.id !== id) } : s
      )
    );

  const total = Number(monthly) || 0;
  const dailyTotal = total / DAYS;
  const pctTotal = stages.reduce((n, s) => n + s.pct, 0);

  const rows = useMemo(() => {
    const out = [];
    for (const s of stages) {
      const stageMonthly = total * (s.pct / 100);
      const weightSum = s.campaigns.reduce((n, c) => n + (Number(c.weight) || 0), 0) || 1;
      for (const c of s.campaigns) {
        const share = (Number(c.weight) || 0) / weightSum;
        const m = stageMonthly * share;
        out.push({
          stage: s.key,
          id: c.id,
          name: c.name,
          weight: c.weight,
          monthly: m,
          daily: m / DAYS,
          ok: m / DAYS >= MIN_DAILY,
        });
      }
    }
    return out;
  }, [stages, total]);

  const maxCampaigns = Math.floor(dailyTotal / MIN_DAILY);
  const underfunded = rows.filter((r) => !r.ok);

  const money = (n) =>
    '£' + (n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const money2 = (n) =>
    '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const warnings = useMemo(() => {
    const w = [];
    if (Math.abs(pctTotal - 100) > 0.5) {
      w.push({
        level: 'blocker',
        text: `Stage split totals ${pctTotal}%, not 100%. Allocation below is scaled to the percentages as entered, so the figures will not sum to the budget.`,
      });
    }
    if (underfunded.length) {
      w.push({
        level: 'blocker',
        text: `${underfunded.length} campaign${underfunded.length === 1 ? '' : 's'} sit${underfunded.length === 1 ? 's' : ''} below the £${MIN_DAILY}/day floor. Merge them, cut them, or raise the budget — underfunded campaigns never gather enough data to optimise.`,
      });
    }
    if (rows.length > maxCampaigns && maxCampaigns > 0) {
      w.push({
        level: 'action',
        text: `${money(total)}/month supports about ${maxCampaigns} campaigns at the minimum viable spend. You have ${rows.length}. Fewer, better-funded campaigns beat more starved ones.`,
      });
    }
    const conv = stages.find((s) => s.key === 'conversion');
    const aware = stages.find((s) => s.key === 'awareness');
    if (conv && aware && conv.pct >= 60 && aware.pct <= 15) {
      w.push({
        level: 'action',
        text: 'Heavy conversion weighting only works against a warm audience. If no retargeting pool exists yet, the first two months will look expensive.',
      });
    }
    if (aware && aware.pct === 0) {
      w.push({
        level: 'action',
        text: 'Nothing allocated to awareness means the retargeting pool never refills. Conversion performance will decay as the existing pool is exhausted.',
      });
    }
    return w;
  }, [pctTotal, underfunded, rows.length, maxCampaigns, stages, total]);

  const normalise = () => {
    const sum = pctTotal || 1;
    setStages((prev) => prev.map((s) => ({ ...s, pct: Math.round((s.pct / sum) * 100) })));
  };

  const copyPlan = () => {
    const lines = [
      `BUDGET ALLOCATION — ${client || 'Unnamed client'}`,
      `${money(total)}/month · ${money2(dailyTotal)}/day · ${preset}`,
      '',
      ...stages.flatMap((s) => [
        `${STAGE_META[s.key].label.toUpperCase()} — ${s.pct}% (${money(total * (s.pct / 100))}/mo)`,
        ...rows
          .filter((r) => r.stage === s.key)
          .map((r) => `  ${r.name}  ${money(r.monthly)}/mo  ${money2(r.daily)}/day${r.ok ? '' : '  [UNDERFUNDED]'}`),
        '',
      ]),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Budget allocation</h1>
            {linked && <div className="linked">Prefilled from {linked}</div>}
          </div>
          <dl className="mast-meta">
            <div>
              <dt>Form</dt>
              <dd>LA-03</dd>
            </div>
            <div>
              <dt>Supports</dt>
              <dd>{maxCampaigns} campaigns</dd>
            </div>
          </dl>
        </header>

        <div className="cols">
          {/* ---------------- controls ---------------- */}
          <div className="panel inputs">
            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">A</span>
                Budget
              </h2>
              <div className="grp-body">
                <Row label="Monthly budget">
                  <Num value={monthly} onChange={setMonthly} prefix="£" w={110} />
                </Row>
                <Row label="Daily equivalent">
                  <span className="ro">{money2(dailyTotal)}</span>
                </Row>
                <Row label="Client">
                  <input
                    className="num txt"
                    value={client}
                    placeholder="—"
                    onChange={(e) => setClient(e.target.value)}
                  />
                </Row>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">B</span>
                Strategy
              </h2>
              <div className="grp-body">
                <div className="presets">
                  {Object.keys(PRESETS).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={preset === p ? 'pre on' : 'pre'}
                      onClick={() => applyPreset(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <p className="preset-note">
                  {PRESETS[preset]?.note || 'Custom split. Percentages edited by hand below.'}
                </p>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">C</span>
                Stage split
              </h2>
              <div className="grp-body">
                {stages.map((s) => (
                  <Row key={s.key} label={STAGE_META[s.key].label} hint={STAGE_META[s.key].hint}>
                    <Num value={s.pct} onChange={(v) => setPct(s.key, v)} suffix="%" w={54} />
                  </Row>
                ))}
                <div className={`ptotal${Math.abs(pctTotal - 100) > 0.5 ? ' off' : ''}`}>
                  <span>Total</span>
                  <span className="ptotal-v">{pctTotal}%</span>
                  {Math.abs(pctTotal - 100) > 0.5 && (
                    <button type="button" className="fixbtn" onClick={normalise}>
                      Normalise
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* ---------------- allocation ---------------- */}
          <div className="panel out">
            {warnings.length > 0 && (
              <ul className="warns">
                {warnings.map((w, i) => (
                  <li key={i} className={`warn ${w.level}`}>
                    <span className="warn-tag">{w.level}</span>
                    {w.text}
                  </li>
                ))}
              </ul>
            )}

            {stages.map((s) => {
              const stageRows = rows.filter((r) => r.stage === s.key);
              const stageMonthly = total * (s.pct / 100);
              return (
                <section className="alloc" key={s.key}>
                  <div className="alloc-head">
                    <span className="alloc-title">{STAGE_META[s.key].label}</span>
                    <span className="alloc-pct">{s.pct}%</span>
                    <span className="alloc-sum">
                      {money(stageMonthly)}<em>/mo</em>
                    </span>
                  </div>

                  {stageRows.length === 0 && (
                    <p className="nocamp">No campaigns in this stage.</p>
                  )}

                  {stageRows.map((r) => (
                    <div className={`camp${r.ok ? '' : ' bad'}`} key={r.id}>
                      <input
                        className="camp-name"
                        value={r.name}
                        onChange={(e) => setCampaign(s.key, r.id, { name: e.target.value })}
                      />
                      <input
                        className="camp-w"
                        type="number"
                        value={r.weight}
                        onChange={(e) => setCampaign(s.key, r.id, { weight: e.target.value })}
                      />
                      <span className="camp-m">{money(r.monthly)}</span>
                      <span className="camp-d">{money2(r.daily)}<em>/d</em></span>
                      <button
                        type="button"
                        className="camp-x"
                        onClick={() => removeCampaign(s.key, r.id)}
                        aria-label={`Remove ${r.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button type="button" className="addbtn" onClick={() => addCampaign(s.key)}>
                    + Add campaign
                  </button>
                </section>
              );
            })}

            <div className="totals">
              <div className="tot">
                <span className="tot-lab">Campaigns</span>
                <span className="tot-val">{rows.length}</span>
              </div>
              <div className="tot">
                <span className="tot-lab">Allocated</span>
                <span className="tot-val">
                  {money(rows.reduce((n, r) => n + r.monthly, 0))}
                </span>
              </div>
              <div className="tot">
                <span className="tot-lab">Underfunded</span>
                <span className={`tot-val${underfunded.length ? ' bad' : ' good'}`}>
                  {underfunded.length}
                </span>
              </div>
            </div>

            <div className="foot">
              <button type="button" className="btn" onClick={copyPlan}>
                Copy plan
              </button>
              <span className="foot-note">
                Weights are relative within a stage, not percentages — they normalise themselves.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
.cols{max-width:1240px;margin:0 auto;display:grid;grid-template-columns:.78fr 1fr;align-items:start;}
.row-hint{display:block;font-style:normal;font-size:9.5px;letter-spacing:.05em;
  color:var(--carbon);opacity:.7;margin-top:1px;text-transform:none;}
.num{font-family:'Courier Prime',monospace;font-size:14.5px;color:var(--carbon);
  background:transparent;border:none;border-bottom:1px solid var(--rule);
  padding:2px 0 3px;text-align:right;border-radius:0;outline:none;}
.num.txt{width:140px;text-align:left;}
.ro{font-family:'Courier Prime',monospace;font-size:14.5px;color:var(--ink-2);}
.presets{display:flex;flex-direction:column;gap:4px;padding:8px 0 2px;}
.pre{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10.5px;
  letter-spacing:.1em;text-transform:uppercase;text-align:left;padding:7px 11px;
  background:none;border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;}
.pre:hover{background:#F1F0EA;}
.pre.on{background:var(--carbon);color:var(--white);border-color:var(--carbon);}
.pre:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.preset-note{margin:9px 0 0;font-size:11.5px;line-height:1.5;color:var(--ink-2);}
.ptotal{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:9px;
  border-top:1px solid var(--rule);font-family:'Archivo Narrow',sans-serif;
  font-weight:700;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-2);}
.ptotal-v{margin-left:auto;font-family:'Courier Prime',monospace;font-size:14.5px;
  letter-spacing:0;color:var(--ok);}
.ptotal.off .ptotal-v{color:var(--stamp);}
.fixbtn{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;background:var(--stamp);
  color:#fff;border:none;cursor:pointer;}
.fixbtn:focus-visible{outline:2px solid var(--ink);outline-offset:2px;}
.warns{list-style:none;margin:0;padding:0;border-bottom:1px solid var(--rule-2);}
.warn{padding:11px 16px;font-size:12.5px;line-height:1.5;color:#4E4A33;
  border-left:3px solid var(--carbon);border-bottom:1px dotted var(--rule-2);}
.warn:last-child{border-bottom:none;}
.warn.blocker{border-left-color:var(--stamp);background:#F7E9C8;}
.warn-tag{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--carbon);margin-bottom:3px;}
.warn.blocker .warn-tag{color:var(--stamp);}
.alloc{padding:12px 16px 14px;border-bottom:1px solid var(--rule-2);}
.alloc-head{display:flex;align-items:baseline;gap:9px;margin-bottom:8px;}
.alloc-title{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:12px;
  letter-spacing:.15em;text-transform:uppercase;}
.alloc-pct{font-family:'Courier Prime',monospace;font-size:11.5px;color:#93803C;}
.alloc-sum{margin-left:auto;font-family:'Courier Prime',monospace;font-weight:700;
  font-size:15px;color:var(--carbon);}
.alloc-sum em{font-style:normal;font-size:11px;color:var(--ink-2);}
.camp{display:grid;grid-template-columns:1fr 46px 74px 78px 22px;align-items:center;gap:7px;
  padding:5px 0;border-bottom:1px dotted var(--rule-2);}
.camp.bad{background:#F7E4C6;margin:0 -8px;padding-left:8px;padding-right:8px;}
.camp-name{font-family:'Archivo',sans-serif;font-size:12.5px;color:var(--ink);
  background:transparent;border:none;border-bottom:1px solid transparent;
  padding:2px 0;outline:none;min-width:0;}
.camp-name:hover{border-bottom-color:var(--rule-2);}
.camp-name:focus{border-bottom-color:var(--carbon);background:#FDFBEC;}
.camp-w{font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--carbon);
  background:transparent;border:none;border-bottom:1px solid var(--rule-2);
  text-align:right;padding:2px 0;outline:none;}
.camp-w::-webkit-outer-spin-button,.camp-w::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
.camp-w[type=number]{-moz-appearance:textfield;}
.camp-m{font-family:'Courier Prime',monospace;font-size:12.5px;text-align:right;color:var(--ink);}
.camp-d{font-family:'Courier Prime',monospace;font-size:12.5px;text-align:right;color:var(--ink-2);}
.camp-d em{font-style:normal;font-size:10px;}
.camp.bad .camp-d{color:var(--stamp);font-weight:700;}
.camp-x{background:none;border:none;cursor:pointer;color:#B5A87A;font-size:16px;
  line-height:1;padding:0;}
.camp-x:hover{color:var(--stamp);}
.camp-x:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.nocamp{margin:4px 0 8px;font-size:11.5px;color:#93803C;}
.addbtn{margin-top:8px;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;background:none;
  border:1px dashed var(--rule-2);color:#93803C;padding:5px 10px;cursor:pointer;}
.addbtn:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.totals{display:flex;border-bottom:1px solid var(--rule-2);}
.tot{flex:1;padding:11px 16px;border-right:1px dotted var(--rule-2);}
.tot:last-child{border-right:none;}
.tot-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.17em;text-transform:uppercase;color:#93803C;margin-bottom:3px;}
.tot-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:19px;color:var(--carbon);}
.tot-val.bad{color:var(--stamp);}
.tot-val.good{color:var(--ok);}
.foot{display:flex;align-items:center;gap:12px;padding:12px 16px;flex-wrap:wrap;}
.foot-note{font-size:10.5px;line-height:1.4;color:#93803C;flex:1;min-width:180px;}
@media (max-width:900px){
  .sheet{padding:10px;}
  .cols{grid-template-columns:1fr;}
  .inputs{border-right:1px solid var(--ink);}
  .out{position:static;max-height:none;border-top:none;}
}
`;
