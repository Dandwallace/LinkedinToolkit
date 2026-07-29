'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

/* ------------------------------------------------------------------ *
 * Sector benchmarks. CPM and CTR drive the top of the funnel; the
 * published CPL is kept only as a sanity check against what the
 * assumptions below actually imply.
 * ------------------------------------------------------------------ */
const SECTORS = {
  'Professional & corporate services': { cpm: 34, ctr: 0.48, cpl: 65 },
  'Technology & software (B2B SaaS)': { cpm: 46, ctr: 0.42, cpl: 125 },
  'Financial services & insurance': { cpm: 52, ctr: 0.38, cpl: 140 },
  'Healthcare & life sciences': { cpm: 55, ctr: 0.35, cpl: 155 },
  'Manufacturing & industrial': { cpm: 32, ctr: 0.52, cpl: 85 },
  'Education & training': { cpm: 28, ctr: 0.55, cpl: 70 },
  'Recruitment & staffing': { cpm: 30, ctr: 0.5, cpl: 75 },
  'Media & communications': { cpm: 29, ctr: 0.58, cpl: 80 },
  'Other / not listed': { cpm: 38, ctr: 0.45, cpl: 100 },
};

/* Native Lead Gen Forms pre-fill from the member profile, so they convert
 * far harder than sending traffic to a landing page. */
const CAPTURE = {
  'Lead Gen Form': 17,
  'Landing page': 6.5,
};

const DEFAULTS = {
  leadToMql: 40,
  mqlToSql: 35,
  sqlToOpp: 50,
  oppToWon: 25,
};

const BLANK = {
  sector: 'Technology & software (B2B SaaS)',
  budget: '5000',
  months: '6',
  capture: 'Lead Gen Form',
  dealSize: '12000',
  cycleDays: '90',
  cpm: '',
  ctr: '',
  captureRate: '',
  ...Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, String(v)])),
  targetRevenue: '500000',
  targetLeads: '',
};

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

function assumptions(s) {
  const bench = SECTORS[s.sector] || SECTORS['Other / not listed'];
  const num = (v, fallback) => {
    const n = Number(v);
    return v !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    cpm: num(s.cpm, bench.cpm),
    ctr: num(s.ctr, bench.ctr),
    captureRate: num(s.captureRate, CAPTURE[s.capture]),
    leadToMql: num(s.leadToMql, DEFAULTS.leadToMql),
    mqlToSql: num(s.mqlToSql, DEFAULTS.mqlToSql),
    sqlToOpp: num(s.sqlToOpp, DEFAULTS.sqlToOpp),
    oppToWon: num(s.oppToWon, DEFAULTS.oppToWon),
    benchCpl: bench.cpl,
  };
}

/** Forward: money in, funnel out. */
function runForward(monthlyBudget, a) {
  const impressions = (monthlyBudget / a.cpm) * 1000;
  const clicks = impressions * (a.ctr / 100);
  const leads = clicks * (a.captureRate / 100);
  const mql = leads * (a.leadToMql / 100);
  const sql = mql * (a.mqlToSql / 100);
  const opp = sql * (a.sqlToOpp / 100);
  const won = opp * (a.oppToWon / 100);
  return { impressions, clicks, leads, mql, sql, opp, won };
}

/** Reverse: target revenue back up the funnel to a required budget. */
function runReverse(targetRevenue, dealSize, a) {
  if (!dealSize) return null;
  const won = targetRevenue / dealSize;
  const opp = won / (a.oppToWon / 100);
  const sql = opp / (a.sqlToOpp / 100);
  const mql = sql / (a.mqlToSql / 100);
  const leads = mql / (a.leadToMql / 100);
  const clicks = leads / (a.captureRate / 100);
  const impressions = clicks / (a.ctr / 100);
  const budget = (impressions / 1000) * a.cpm;
  return { impressions, clicks, leads, mql, sql, opp, won, budget };
}

/* ------------------------------------------------------------------ *
 * UI primitives — shared visual language with the intake form
 * ------------------------------------------------------------------ */

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

function Num({ value, onChange, placeholder, prefix, suffix, wide }) {
  return (
    <span className={`nw${wide ? ' wide' : ''}`}>
      {prefix && <span className="afx pre">{prefix}</span>}
      <input
        className="num"
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className="afx suf">{suffix}</span>}
    </span>
  );
}

function Pick({ value, onChange, options }) {
  return (
    <select className="num sel" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export default function ForecastModel() {
  const [s, setS] = useState(BLANK);
  const [mode, setMode] = useState('forward');
  const [linked, setLinked] = useState(null);
  const loaded = useRef(false);

  const set = (k) => (v) => setS((p) => ({ ...p, [k]: v }));

  /* Pull whatever the intake form captured. This is the architecture
   * working: one brief, every tool reads from it. */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (r?.value) {
          const b = JSON.parse(r.value);
          const patch = {};
          if (b.sector && SECTORS[b.sector]) patch.sector = b.sector;
          if (b.budget && b.months) patch.budget = String(Math.round(Number(b.budget) / Number(b.months)));
          if (b.months) patch.months = b.months;
          if (b.dealSize) patch.dealSize = b.dealSize;
          if (b.landingPages === 'No') patch.capture = 'Lead Gen Form';
          if (b.targetLeads) patch.targetLeads = b.targetLeads;
          if (Object.keys(patch).length) {
            setS((p) => ({ ...p, ...patch }));
            setLinked(b.client || 'saved brief');
          }
        }
      } catch {
        /* no brief saved yet */
      }
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      window.storage?.set('forecast:current', JSON.stringify(s)).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [s]);

  const a = useMemo(() => assumptions(s), [s]);
  const monthly = Number(s.budget) || 0;
  const dealSize = Number(s.dealSize) || 0;
  const months = Number(s.months) || 0;

  const fwd = useMemo(() => (monthly ? runForward(monthly, a) : null), [monthly, a]);
  const rev = useMemo(
    () => (mode === 'reverse' ? runReverse(Number(s.targetRevenue) || 0, dealSize, a) : null),
    [mode, s.targetRevenue, dealSize, a]
  );

  const f = mode === 'reverse' ? rev : fwd;
  const budgetShown = mode === 'reverse' ? rev?.budget || 0 : monthly;

  const derived = useMemo(() => {
    if (!f || !budgetShown) return null;
    const revenue = f.won * dealSize;
    return {
      cpl: f.leads ? budgetShown / f.leads : 0,
      cpo: f.opp ? budgetShown / f.opp : 0,
      cac: f.won ? budgetShown / f.won : 0,
      revenue,
      roas: budgetShown ? revenue / budgetShown : 0,
      pipeline: f.opp * dealSize,
      totalSpend: budgetShown * (months || 1),
      totalRevenue: revenue * (months || 1),
    };
  }, [f, budgetShown, dealSize, months]);

  const money = (n, dp = 0) =>
    '£' + (n || 0).toLocaleString('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: dp });
  const count = (n) => Math.round(n || 0).toLocaleString('en-GB');

  /* Log scale, because impressions to closed-won spans five orders of
   * magnitude and a linear bar makes everything past clicks invisible. */
  const bar = (v) => {
    if (!f || !v || v <= 0) return 2;
    const max = Math.log10(Math.max(f.impressions, 10));
    return Math.max(2, (Math.log10(Math.max(v, 1)) / max) * 100);
  };

  const stages = f
    ? [
        { key: 'impressions', label: 'Impressions', v: f.impressions, rate: null },
        { key: 'clicks', label: 'Clicks', v: f.clicks, rate: `${a.ctr}% CTR` },
        { key: 'leads', label: 'Leads', v: f.leads, rate: `${a.captureRate}% capture` },
        { key: 'mql', label: 'MQLs', v: f.mql, rate: `${a.leadToMql}%` },
        { key: 'sql', label: 'SQLs', v: f.sql, rate: `${a.mqlToSql}%` },
        { key: 'opp', label: 'Opportunities', v: f.opp, rate: `${a.sqlToOpp}%` },
        { key: 'won', label: 'Closed won', v: f.won, rate: `${a.oppToWon}%` },
      ]
    : [];

  /* Sanity check: do these assumptions imply a CPL the sector supports? */
  const cplCheck = useMemo(() => {
    if (!derived?.cpl) return null;
    const ratio = derived.cpl / a.benchCpl;
    if (ratio < 0.55)
      return {
        level: 'warn',
        text: `Your assumptions imply ${money(derived.cpl)} per lead against a sector benchmark near ${money(a.benchCpl)}. That is optimistic — tighten CTR or capture rate before showing a client.`,
      };
    if (ratio > 1.8)
      return {
        level: 'warn',
        text: `Implied CPL of ${money(derived.cpl)} runs well above the ${money(a.benchCpl)} sector benchmark. Either the assumptions are pessimistic or the targeting plan needs work.`,
      };
    return {
      level: 'ok',
      text: `Implied CPL of ${money(derived.cpl)} sits within range of the ${money(a.benchCpl)} sector benchmark.`,
    };
  }, [derived, a.benchCpl]);

  const targetLeads = Number(s.targetLeads) || 0;
  const gap = f && targetLeads ? f.leads - targetLeads : null;

  const sensitivity = useMemo(() => {
    if (mode === 'reverse' || !monthly) return null;
    return [0.5, 1, 1.5, 2].map((m) => {
      const r = runForward(monthly * m, a);
      return {
        mult: m,
        budget: monthly * m,
        leads: r.leads,
        won: r.won,
        revenue: r.won * dealSize,
      };
    });
  }, [mode, monthly, a, dealSize]);

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Pipeline forecast</h1>
            {linked && <div className="linked">Prefilled from {linked}</div>}
          </div>
          <div className="mast-right">
            <div className="modes">
              <button
                type="button"
                className={mode === 'forward' ? 'mode on' : 'mode'}
                onClick={() => setMode('forward')}
              >
                Budget → pipeline
              </button>
              <button
                type="button"
                className={mode === 'reverse' ? 'mode on' : 'mode'}
                onClick={() => setMode('reverse')}
              >
                Target → budget
              </button>
            </div>
            <dl className="mast-meta">
              <dt>Form</dt>
              <dd>LA-02</dd>
            </dl>
          </div>
        </header>

        <div className="cols">
          {/* ---------------- inputs ---------------- */}
          <div className="panel inputs">
            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">A</span>
                {mode === 'reverse' ? 'Target' : 'Investment'}
              </h2>
              <div className="grp-body">
                {mode === 'reverse' ? (
                  <Row label="Revenue target" hint="over the period">
                    <Num value={s.targetRevenue} onChange={set('targetRevenue')} prefix="£" wide />
                  </Row>
                ) : (
                  <Row label="Monthly budget">
                    <Num value={s.budget} onChange={set('budget')} prefix="£" wide />
                  </Row>
                )}
                <Row label="Duration" hint="months">
                  <Num value={s.months} onChange={set('months')} wide />
                </Row>
                <Row label="Sector">
                  <Pick value={s.sector} onChange={set('sector')} options={Object.keys(SECTORS)} />
                </Row>
                <Row label="Average deal size">
                  <Num value={s.dealSize} onChange={set('dealSize')} prefix="£" wide />
                </Row>
                {mode === 'forward' && (
                  <Row label="Lead target" hint="per month, optional">
                    <Num value={s.targetLeads} onChange={set('targetLeads')} wide />
                  </Row>
                )}
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">B</span>
                Media assumptions
              </h2>
              <div className="grp-body">
                <Row label="CPM" hint={`benchmark ${money(SECTORS[s.sector].cpm)}`}>
                  <Num
                    value={s.cpm}
                    onChange={set('cpm')}
                    prefix="£"
                    placeholder={String(SECTORS[s.sector].cpm)}
                  />
                </Row>
                <Row label="Click-through rate" hint={`benchmark ${SECTORS[s.sector].ctr}%`}>
                  <Num
                    value={s.ctr}
                    onChange={set('ctr')}
                    suffix="%"
                    placeholder={String(SECTORS[s.sector].ctr)}
                  />
                </Row>
                <Row label="Capture method">
                  <Pick value={s.capture} onChange={set('capture')} options={Object.keys(CAPTURE)} />
                </Row>
                <Row label="Capture rate" hint={`default ${CAPTURE[s.capture]}%`}>
                  <Num
                    value={s.captureRate}
                    onChange={set('captureRate')}
                    suffix="%"
                    placeholder={String(CAPTURE[s.capture])}
                  />
                </Row>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">C</span>
                Funnel conversion
              </h2>
              <div className="grp-body">
                <Row label="Lead → MQL">
                  <Num value={s.leadToMql} onChange={set('leadToMql')} suffix="%" />
                </Row>
                <Row label="MQL → SQL">
                  <Num value={s.mqlToSql} onChange={set('mqlToSql')} suffix="%" />
                </Row>
                <Row label="SQL → Opportunity">
                  <Num value={s.sqlToOpp} onChange={set('sqlToOpp')} suffix="%" />
                </Row>
                <Row label="Opportunity → Won">
                  <Num value={s.oppToWon} onChange={set('oppToWon')} suffix="%" />
                </Row>
                <Row label="Sales cycle" hint="days">
                  <Num value={s.cycleDays} onChange={set('cycleDays')} />
                </Row>
                <div className="reset-wrap">
                  <button
                    type="button"
                    className="reset"
                    onClick={() =>
                      setS((p) => ({
                        ...p,
                        cpm: '',
                        ctr: '',
                        captureRate: '',
                        ...Object.fromEntries(
                          Object.entries(DEFAULTS).map(([k, v]) => [k, String(v)])
                        ),
                      }))
                    }
                  >
                    Reset to benchmarks
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* ---------------- output ---------------- */}
          <div className="panel out">
            {!f || (mode === 'reverse' && !dealSize) ? (
              <p className="empty">
                {mode === 'reverse'
                  ? 'Enter a revenue target and an average deal size to work backwards to a budget.'
                  : 'Enter a monthly budget to model the funnel.'}
              </p>
            ) : (
              <>
                <div className="heads">
                  {mode === 'reverse' ? (
                    <>
                      <div className="head big">
                        <span className="head-lab">Budget required</span>
                        <span className="head-val">{money(rev.budget)}<em>/mo</em></span>
                      </div>
                      <div className="head">
                        <span className="head-lab">Total over {months || 1} months</span>
                        <span className="head-val">{money(rev.budget * (months || 1))}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="head big">
                        <span className="head-lab">Leads per month</span>
                        <span className="head-val">{count(f.leads)}</span>
                      </div>
                      <div className="head">
                        <span className="head-lab">Cost per lead</span>
                        <span className="head-val">{money(derived.cpl)}</span>
                      </div>
                      <div className="head">
                        <span className="head-lab">Pipeline / mo</span>
                        <span className="head-val">{money(derived.pipeline)}</span>
                      </div>
                      <div className="head">
                        <span className="head-lab">Return on spend</span>
                        <span className={`head-val${derived.roas >= 1 ? ' good' : ' bad'}`}>
                          {derived.roas.toFixed(1)}×
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {gap !== null && (
                  <div className={`gap ${gap >= 0 ? 'ok' : 'short'}`}>
                    {gap >= 0
                      ? `Clears the ${count(targetLeads)} lead target by ${count(gap)} per month.`
                      : `Short of the ${count(targetLeads)} lead target by ${count(-gap)} per month. Roughly ${money((targetLeads / f.leads) * monthly)}/mo would be needed at these assumptions.`}
                  </div>
                )}

                <section className="funnel">
                  <div className="funnel-head">
                    Monthly funnel
                    <em>bars on a log scale</em>
                  </div>
                  {stages.map((st) => (
                    <div className="stage" key={st.key}>
                      <div className="stage-top">
                        <span className="stage-lab">{st.label}</span>
                        {st.rate && <span className="stage-rate">{st.rate}</span>}
                        <span className="stage-val">
                          {st.v < 10 && st.v > 0 ? st.v.toFixed(1) : count(st.v)}
                        </span>
                      </div>
                      <div className="track">
                        <div className={`fill ${st.key}`} style={{ width: `${bar(st.v)}%` }} />
                      </div>
                    </div>
                  ))}
                </section>

                <section className="unit">
                  <div className="unit-head">Unit economics</div>
                  <table className="tbl">
                    <tbody>
                      <tr>
                        <th>Cost per lead</th>
                        <td>{money(derived.cpl)}</td>
                      </tr>
                      <tr>
                        <th>Cost per opportunity</th>
                        <td>{money(derived.cpo)}</td>
                      </tr>
                      <tr>
                        <th>Cost per acquisition</th>
                        <td>{money(derived.cac)}</td>
                      </tr>
                      <tr className="rule">
                        <th>Revenue per month</th>
                        <td>{money(derived.revenue)}</td>
                      </tr>
                      <tr>
                        <th>Spend over {months || 1} months</th>
                        <td>{money(derived.totalSpend)}</td>
                      </tr>
                      <tr className="hi">
                        <th>Revenue over {months || 1} months</th>
                        <td>{money(derived.totalRevenue)}</td>
                      </tr>
                      <tr>
                        <th>First revenue lands</th>
                        <td>~{Math.round(Number(s.cycleDays) / 30) || 0} months in</td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {cplCheck && (
                  <div className={`check ${cplCheck.level}`}>
                    <span className="check-tag">
                      {cplCheck.level === 'ok' ? 'Sense check' : 'Check assumptions'}
                    </span>
                    <p>{cplCheck.text}</p>
                  </div>
                )}

                {sensitivity && (
                  <section className="sens">
                    <div className="sens-head">If budget changed</div>
                    <table className="tbl sens-tbl">
                      <thead>
                        <tr>
                          <th>Monthly</th>
                          <th>Leads</th>
                          <th>Won</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sensitivity.map((r) => (
                          <tr key={r.mult} className={r.mult === 1 ? 'now' : ''}>
                            <th>
                              {money(r.budget)}
                              {r.mult === 1 && <em> current</em>}
                            </th>
                            <td>{count(r.leads)}</td>
                            <td>{r.won < 10 ? r.won.toFixed(1) : count(r.won)}</td>
                            <td>{money(r.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                <p className="disclaimer">
                  Benchmarks are indicative sector figures, not forecasts. Every number below the
                  lead line depends on the client's own funnel rates — get their real ones before
                  presenting this.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
.sheet {
  --white:#FCFCFA; --canary:#FAF3D2; --ink:#1B1D19; --ink-2:#5C5F57;
  --carbon:#3A3F7A; --rule:#D6D4C8; --rule-2:#DCCF8E;
  --stamp:#A8342A; --ok:#2F6B4F;
  font-family:'Archivo',system-ui,sans-serif; color:var(--ink);
  background:#E8E6DD; min-height:100vh; padding:20px; box-sizing:border-box;
  -webkit-font-smoothing:antialiased;
}
.masthead{
  max-width:1240px;margin:0 auto;background:var(--white);
  border:1px solid var(--ink);border-bottom:none;padding:16px 22px 14px;
  display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;
}
.mast-right{display:flex;align-items:flex-end;gap:18px;}
.modes{display:inline-flex;border:1px solid var(--rule);}
.mode{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10.5px;
  letter-spacing:.11em;text-transform:uppercase;padding:7px 14px;background:none;
  color:var(--ink-2);border:none;cursor:pointer;}
.mode+.mode{border-left:1px solid var(--rule);}
.mode:hover{background:#F1F0EA;}
.mode.on{background:var(--carbon);color:var(--white);}
.mode:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.mast-meta dt{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);}
.cols{max-width:1240px;margin:0 auto;display:grid;grid-template-columns:.82fr 1fr;align-items:start;}
.row-hint{display:block;font-style:normal;font-size:9.5px;letter-spacing:.06em;
  color:var(--carbon);opacity:.7;margin-top:1px;}
.nw.wide .num{width:112px;}
.num{width:74px;font-family:'Courier Prime',monospace;font-size:14.5px;color:var(--carbon);
  background:transparent;border:none;border-bottom:1px solid var(--rule);
  padding:2px 0 3px;text-align:right;border-radius:0;outline:none;}
.num::placeholder{color:#B6B4A9;}
.sel{width:auto;max-width:210px;text-align:left;cursor:pointer;font-size:13px;}
.afx.pre{margin-right:1px;}
.reset-wrap{padding-top:10px;}
.reset{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.13em;text-transform:uppercase;background:none;color:var(--carbon);
  border:1px solid var(--rule);padding:6px 12px;cursor:pointer;width:100%;}
.reset:hover{background:#F1F0EA;}
.reset:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.empty{padding:26px 20px;margin:0;font-size:13px;line-height:1.55;color:#8C7C43;}
.heads{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--rule-2);}
.head{flex:1 1 auto;min-width:104px;padding:13px 16px;border-right:1px dotted var(--rule-2);}
.head.big{flex:1 1 100%;border-right:none;border-bottom:1px dotted var(--rule-2);}
.head-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:20px;color:var(--carbon);}
.head.big .head-val{font-size:34px;line-height:1;}
.head-val em{font-style:normal;font-size:14px;color:var(--ink-2);}
.gap{padding:9px 16px;font-size:12.5px;line-height:1.45;border-bottom:1px solid var(--rule-2);}
.gap.ok{background:#E6F0E4;color:#255740;}
.gap.short{background:#F7E4C6;color:#7A3B22;}
.funnel{padding:14px 16px 16px;border-bottom:1px solid var(--rule-2);}
.funnel-head,.unit-head,.sens-head{font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#93803C;
  margin-bottom:10px;display:flex;justify-content:space-between;align-items:baseline;}
.funnel-head em{font-style:normal;letter-spacing:.05em;opacity:.7;text-transform:none;font-size:9.5px;}
.stage{margin-bottom:9px;}
.stage:last-child{margin-bottom:0;}
.stage-top{display:flex;align-items:baseline;gap:8px;margin-bottom:3px;}
.stage-lab{font-family:'Archivo',sans-serif;font-weight:500;font-size:12.5px;color:var(--ink-2);}
.stage-rate{font-family:'Courier Prime',monospace;font-size:10.5px;color:#93803C;}
.stage-val{margin-left:auto;font-family:'Courier Prime',monospace;font-weight:700;
  font-size:14px;color:var(--ink);}
.track{height:9px;background:#EFE5B8;}
.fill{height:100%;background:var(--carbon);transition:width .25s ease-out;}
.fill.won{background:var(--ok);}
.fill.opp{background:#4A5090;}
.unit,.sens{padding:14px 16px 16px;border-bottom:1px solid var(--rule-2);}
.tbl tr.rule th,.tbl tr.rule td{border-top:1px solid var(--rule-2);padding-top:7px;}
.sens-tbl thead th{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.13em;text-transform:uppercase;color:#93803C;}
.sens-tbl thead th:not(:first-child){text-align:right;}
.sens-tbl th em{font-style:normal;font-size:10px;color:#93803C;letter-spacing:.08em;
  text-transform:uppercase;}
.sens-tbl tr.now th,.sens-tbl tr.now td{background:#F3E9B8;font-weight:700;}
.check{padding:11px 16px;border-bottom:1px solid var(--rule-2);border-left:3px solid var(--ok);}
.check.warn{border-left-color:var(--stamp);background:#F7E9C8;}
.check-tag{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.2em;text-transform:uppercase;color:var(--ok);display:block;margin-bottom:3px;}
.check.warn .check-tag{color:var(--stamp);}
.check p{margin:0;font-size:12.5px;line-height:1.5;color:#4E4A33;}
@media (max-width:900px){
  .sheet{padding:10px;}
  .cols{grid-template-columns:1fr;}
  .inputs{border-right:1px solid var(--ink);}
  .out{position:static;max-height:none;border-top:none;}
  .mast-right{width:100%;justify-content:space-between;}
}
@media (prefers-reduced-motion:reduce){.fill{transition:none;}}
`;
