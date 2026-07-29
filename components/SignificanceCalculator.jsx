'use client';

import React, { useState, useMemo } from 'react';

/* ------------------------------------------------------------------ *
 * Statistics
 *
 * Two-proportion z-test, two-tailed. This is the standard test for
 * comparing two rates (CTR, conversion rate, lead rate) where each
 * observation is a yes/no outcome.
 * ------------------------------------------------------------------ */

/** Abramowitz & Stegun 7.1.26 — accurate to about 1.5e-7. */
function erf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/* Critical values, hardcoded rather than inverting the normal —
 * these are the only confidence levels anyone actually uses. */
const Z_CRIT = { 90: 1.645, 95: 1.96, 99: 2.576 };
/* z for 80% power, the conventional default. */
const Z_POWER = 0.8416;

function evaluate(nA, xA, nB, xB, confidence) {
  if (!nA || !nB || nA <= 0 || nB <= 0) return null;
  if (xA > nA || xB > nB) return { error: 'More conversions than trials — check the inputs.' };

  const pA = xA / nA;
  const pB = xB / nB;
  const pooled = (xA + xB) / (nA + nB);

  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (sePooled === 0) return { error: 'No variation in the data — both rates are identical at 0 or 100%.' };

  const z = (pB - pA) / sePooled;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  /* Unpooled SE for the interval around the observed difference. */
  const seUnpooled = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const zc = Z_CRIT[confidence];
  const diff = pB - pA;
  const ciLow = diff - zc * seUnpooled;
  const ciHigh = diff + zc * seUnpooled;

  return {
    pA,
    pB,
    diff,
    relLift: pA > 0 ? (pB - pA) / pA : null,
    z,
    pValue,
    ciLow,
    ciHigh,
    significant: pValue < (100 - confidence) / 100,
    winner: pB > pA ? 'B' : pA > pB ? 'A' : null,
    confidence: (1 - pValue) * 100,
  };
}

/** Sample size per variant to detect a given relative lift at 80% power. */
function requiredSample(baseRate, relLift, confidence) {
  if (!baseRate || !relLift) return null;
  const p1 = baseRate;
  const p2 = baseRate * (1 + relLift);
  if (p2 >= 1 || p2 <= 0) return null;
  const zc = Z_CRIT[confidence];
  const n =
    ((zc + Z_POWER) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2;
  return Math.ceil(n);
}

const METRICS = {
  'Click-through rate': { trial: 'Impressions', event: 'Clicks' },
  'Conversion rate': { trial: 'Clicks', event: 'Conversions' },
  'Lead form completion': { trial: 'Form opens', event: 'Submissions' },
};

/* ------------------------------------------------------------------ */

function Field({ label, value, onChange }) {
  return (
    <label className="fld">
      <span className="fld-label">{label}</span>
      <input
        className="num"
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function SignificanceCalculator() {
  const [metric, setMetric] = useState('Click-through rate');
  const [confidence, setConfidence] = useState(95);
  const [a, setA] = useState({ n: '12000', x: '54' });
  const [b, setB] = useState({ n: '12000', x: '71' });
  const [dailyVolume, setDailyVolume] = useState('800');
  const [minLift, setMinLift] = useState('20');

  const labels = METRICS[metric];

  const nA = Number(a.n) || 0;
  const xA = Number(a.x) || 0;
  const nB = Number(b.n) || 0;
  const xB = Number(b.x) || 0;

  const result = useMemo(() => evaluate(nA, xA, nB, xB, confidence), [nA, xA, nB, xB, confidence]);

  const planner = useMemo(() => {
    if (!result || result.error) return null;
    const base = result.pA;
    const lift = (Number(minLift) || 0) / 100;
    const need = requiredSample(base, lift, confidence);
    if (!need) return null;
    const have = Math.min(nA, nB);
    const shortfall = Math.max(0, need - have);
    const perDay = Number(dailyVolume) || 0;
    return {
      need,
      have,
      shortfall,
      days: perDay > 0 && shortfall > 0 ? Math.ceil(shortfall / perDay) : 0,
      enough: shortfall === 0,
    };
  }, [result, minLift, confidence, nA, nB, dailyVolume]);

  const warnings = useMemo(() => {
    const w = [];
    if (!result || result.error) return w;

    if (Math.min(xA, xB) < 30) {
      w.push({
        level: 'blocker',
        text: `Only ${Math.min(xA, xB)} ${labels.event.toLowerCase()} in the smaller arm. Below about 30 the maths is unstable and a single extra event swings the result — do not call this yet whatever the p-value says.`,
      });
    }
    if (Math.min(nA, nB) < 1000 && metric === 'Click-through rate') {
      w.push({
        level: 'action',
        text: 'Under 1,000 impressions per variant is very early for a CTR test. LinkedIn delivery is uneven in the first days, so the split may not be comparable yet.',
      });
    }
    const imbalance = Math.abs(nA - nB) / Math.max(nA, nB);
    if (imbalance > 0.25) {
      w.push({
        level: 'action',
        text: `The two arms differ in size by ${Math.round(imbalance * 100)}%. That is fine statistically, but a large gap usually means LinkedIn is favouring one creative — worth knowing before you conclude the copy caused the difference.`,
      });
    }
    if (result.significant && Math.abs(result.diff) < 0.001) {
      w.push({
        level: 'note',
        text: 'Statistically significant but the absolute difference is tiny. At large volumes trivial gaps clear the significance bar — check the lift is worth acting on commercially.',
      });
    }
    if (!result.significant && planner && !planner.enough) {
      w.push({
        level: 'note',
        text: 'Not significant is not the same as no difference. The test may simply not have enough data yet — see the planner below.',
      });
    }
    w.push({
      level: 'note',
      text: 'Decide the sample size before you start and check once at the end. Watching daily and stopping at the first green result is the most common way to manufacture a false winner.',
    });
    return w;
  }, [result, xA, xB, nA, nB, metric, labels, planner]);

  const pct = (v, dp = 2) => (v * 100).toFixed(dp) + '%';
  const num = (v) => Math.round(v).toLocaleString('en-GB');

  const verdict = !result || result.error
    ? { main: 'Awaiting data', sub: '', cls: 'idle' }
    : result.significant
    ? { main: `Variant ${result.winner} wins`, sub: `at ${confidence}% confidence`, cls: 'win' }
    : { main: 'Not yet', sub: 'difference could be noise', cls: 'no' };

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Test significance</h1>
          </div>
          <div className={`stamp ${verdict.cls}`}>
            <span className="stamp-main">{verdict.main}</span>
            {verdict.sub && <span className="stamp-sub">{verdict.sub}</span>}
          </div>
        </header>

        <div className="cols">
          {/* ---------------- inputs ---------------- */}
          <div className="panel inputs">
            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">A</span>
                What you are testing
              </h2>
              <div className="grp-body">
                <div className="chips">
                  {Object.keys(METRICS).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={metric === m ? 'chip on' : 'chip'}
                      onClick={() => setMetric(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div className="conf">
                  <span className="conf-lab">Confidence</span>
                  {[90, 95, 99].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={confidence === c ? 'chip sm on' : 'chip sm'}
                      onClick={() => setConfidence(c)}
                    >
                      {c}%
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">B</span>
                Variant A — control
              </h2>
              <div className="grp-body">
                <Field label={labels.trial} value={a.n} onChange={(v) => setA((p) => ({ ...p, n: v }))} />
                <Field label={labels.event} value={a.x} onChange={(v) => setA((p) => ({ ...p, x: v }))} />
                <div className="rate">
                  Rate <strong>{nA ? pct(xA / nA) : '—'}</strong>
                </div>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">C</span>
                Variant B — challenger
              </h2>
              <div className="grp-body">
                <Field label={labels.trial} value={b.n} onChange={(v) => setB((p) => ({ ...p, n: v }))} />
                <Field label={labels.event} value={b.x} onChange={(v) => setB((p) => ({ ...p, x: v }))} />
                <div className="rate">
                  Rate <strong>{nB ? pct(xB / nB) : '—'}</strong>
                </div>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">D</span>
                Planning
              </h2>
              <div className="grp-body">
                <Field
                  label="Smallest lift worth detecting (%)"
                  value={minLift}
                  onChange={setMinLift}
                />
                <Field
                  label={`${labels.trial} per day, per variant`}
                  value={dailyVolume}
                  onChange={setDailyVolume}
                />
                <p className="hint">
                  Set the lift you would actually change something for. Chasing a 2% improvement
                  needs enormous volume and rarely justifies the wait.
                </p>
              </div>
            </section>
          </div>

          {/* ---------------- results ---------------- */}
          <div className="panel out">
            {!result && <p className="empty">Enter volumes for both variants.</p>}

            {result?.error && (
              <div className="issue blocker">
                <span className="issue-tag">Check inputs</span>
                {result.error}
              </div>
            )}

            {result && !result.error && (
              <>
                <div className="heads">
                  <div className="head">
                    <span className="head-lab">Variant A</span>
                    <span className="head-val">{pct(result.pA)}</span>
                  </div>
                  <div className="head">
                    <span className="head-lab">Variant B</span>
                    <span className="head-val">{pct(result.pB)}</span>
                  </div>
                  <div className="head">
                    <span className="head-lab">Relative lift</span>
                    <span className={`head-val${result.diff > 0 ? ' good' : result.diff < 0 ? ' bad' : ''}`}>
                      {result.relLift === null
                        ? '—'
                        : `${result.relLift > 0 ? '+' : ''}${(result.relLift * 100).toFixed(1)}%`}
                    </span>
                  </div>
                </div>

                <section className="block">
                  <div className="block-head">Statistics</div>
                  <table className="tbl">
                    <tbody>
                      <tr className="hi">
                        <th>p-value</th>
                        <td>{result.pValue < 0.0001 ? '< 0.0001' : result.pValue.toFixed(4)}</td>
                      </tr>
                      <tr>
                        <th>Confidence in the difference</th>
                        <td>{result.confidence.toFixed(2)}%</td>
                      </tr>
                      <tr>
                        <th>z-score</th>
                        <td>{result.z.toFixed(3)}</td>
                      </tr>
                      <tr>
                        <th>Absolute difference</th>
                        <td>
                          {result.diff > 0 ? '+' : ''}
                          {pct(result.diff, 3)}
                        </td>
                      </tr>
                      <tr>
                        <th>{confidence}% interval on the difference</th>
                        <td>
                          {pct(result.ciLow, 3)} to {pct(result.ciHigh, 3)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="read">
                    {result.significant
                      ? `A difference this large would appear by chance about ${(result.pValue * 100).toFixed(2)}% of the time if the two were really identical. That clears your ${confidence}% bar.`
                      : `A difference this large would appear by chance about ${(result.pValue * 100).toFixed(1)}% of the time even if the two were identical, which is too often to call it.`}
                    {result.ciLow < 0 && result.ciHigh > 0 &&
                      ' The interval spans zero, so the true difference could run either way.'}
                  </p>
                </section>

                {planner && (
                  <section className="block">
                    <div className="block-head">Sample size needed</div>
                    <table className="tbl">
                      <tbody>
                        <tr>
                          <th>To detect a {minLift}% lift</th>
                          <td>{num(planner.need)} per variant</td>
                        </tr>
                        <tr>
                          <th>Currently collected</th>
                          <td>{num(planner.have)}</td>
                        </tr>
                        <tr className={planner.enough ? 'hi' : ''}>
                          <th>{planner.enough ? 'Status' : 'Still needed'}</th>
                          <td>
                            {planner.enough ? 'Enough data' : `${num(planner.shortfall)} per variant`}
                          </td>
                        </tr>
                        {!planner.enough && planner.days > 0 && (
                          <tr>
                            <th>At current volume</th>
                            <td>~{planner.days} more day{planner.days === 1 ? '' : 's'}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <p className="read">
                      Based on 80% power — an 80% chance of spotting a real {minLift}% lift if one
                      exists. Halving the lift you want to detect roughly quadruples the sample needed.
                    </p>
                  </section>
                )}

                <ul className="issues">
                  {warnings.map((w, i) => (
                    <li key={i} className={`issue ${w.level}`}>
                      <span className="issue-tag">{w.level}</span>
                      {w.text}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
.masthead{max-width:1080px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-bottom:none;padding:16px 22px 14px;display:flex;align-items:center;
  justify-content:space-between;gap:20px;flex-wrap:wrap;}
.stamp{border:2.5px solid var(--ink-2);color:var(--ink-2);padding:7px 16px;
  transform:rotate(-3deg);text-align:center;flex:none;}
.stamp.win{border-color:var(--ok);color:var(--ok);}
.stamp.no{border-color:var(--stamp);color:var(--stamp);}
.stamp.idle{opacity:.45;}
.stamp-main{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:18px;letter-spacing:.11em;text-transform:uppercase;line-height:1.05;}
.stamp-sub{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9px;letter-spacing:.15em;text-transform:uppercase;opacity:.85;margin-top:2px;}
.cols{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:.82fr 1fr;align-items:start;}
.grp-body{padding:10px 18px 14px;}
.chips{display:flex;flex-wrap:wrap;gap:4px;}
.chip{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.1em;text-transform:uppercase;padding:6px 11px;background:none;
  border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;}
.chip:hover{background:#F1F0EA;}
.chip.sm{padding:4px 9px;font-size:9.5px;}
.conf{display:flex;align-items:center;gap:4px;margin-top:11px;padding-top:11px;
  border-top:1px dotted var(--rule);}
.conf-lab{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.15em;text-transform:uppercase;color:var(--ink-2);margin-right:5px;}
.fld{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;
  padding:7px 0;border-bottom:1px dotted var(--rule);}
.fld-label{font-family:'Archivo Narrow',sans-serif;font-weight:600;font-size:11.5px;
  letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2);}
.num{width:96px;font-family:'Courier Prime',monospace;font-size:14.5px;color:var(--carbon);
  background:transparent;border:none;border-bottom:1px solid var(--rule);
  padding:2px 0 3px;text-align:right;border-radius:0;outline:none;}
.rate{margin-top:9px;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.15em;text-transform:uppercase;color:var(--ink-2);
  display:flex;justify-content:space-between;align-items:baseline;}
.rate strong{font-family:'Courier Prime',monospace;font-size:16px;letter-spacing:0;
  color:var(--carbon);}
.hint{margin:10px 0 0;font-size:11px;line-height:1.5;color:var(--ink-2);}
.empty{padding:26px 20px;margin:0;font-size:13px;color:#8C7C43;}
.heads{display:flex;border-bottom:1px solid var(--rule-2);}
.head{flex:1;padding:13px 16px;border-right:1px dotted var(--rule-2);}
.head-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:21px;color:var(--carbon);}
.block-head{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.16em;text-transform:uppercase;color:#93803C;margin-bottom:8px;}
.read{margin:9px 0 0;font-size:12px;line-height:1.55;color:#4E4A33;}
@media (max-width:860px){
  .sheet{padding:10px;}
  .cols{grid-template-columns:1fr;}
  .inputs{border-right:1px solid var(--ink);}
  .out{position:static;max-height:none;border-top:none;}
  .masthead{flex-direction:column;align-items:flex-start;}
  .stamp{transform:none;align-self:flex-end;}
}
`;
