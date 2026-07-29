'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

/* ------------------------------------------------------------------ *
 * Retargeting planner.
 *
 * The gap this fills: a funnel plan usually gets drawn as three stages
 * running at once, when in practice the conversion layer cannot run until
 * a pool exists to retarget. LinkedIn will not let an audience be used
 * below 300 matched members, and delivers unreliably until well above it.
 *
 * So the real question is not "which audiences should we build" but
 * "when will each one be usable", which is arithmetic nobody does.
 * ------------------------------------------------------------------ */

const FLOOR = 300;      // LinkedIn's hard minimum for a usable audience
const WORKABLE = 1000;  // where delivery and optimisation get reliable

/* Each source converts upstream activity into audience members at some
 * rate. Defaults are deliberately conservative and all editable — they
 * vary enormously by creative and audience. */
const SOURCES = {
  'Video viewers (25%)': {
    needs: 'video',
    basis: 'impressions',
    rate: 8,
    unit: '% of impressions',
    window: '365 days',
    next: 'Document ad or case study — they have shown interest but know little yet.',
    note: 'Fills fastest of any source. A 25% view is a low bar, which is the point at this stage.',
  },
  'Video viewers (75%)': {
    needs: 'video',
    basis: 'impressions',
    rate: 1.8,
    unit: '% of impressions',
    window: '365 days',
    next: 'Lead Gen Form. Watching three quarters of a video is a genuine signal.',
    note: 'Much smaller but far higher intent. Worth a separate campaign, not a merge with the 25% pool.',
  },
  'Website visitors — all': {
    needs: 'tag',
    basis: 'clicks',
    rate: 72,
    unit: '% of clicks that land',
    window: '90 days',
    next: 'Case study or comparison content.',
    note: 'Requires the Insight Tag live and verified. Nothing accrues before that, and it cannot be backdated.',
  },
  'Website visitors — pricing or demo page': {
    needs: 'tag',
    basis: 'clicks',
    rate: 6,
    unit: '% of clicks',
    window: '90 days',
    next: 'Direct conversion offer. This is the highest-intent pool you will build.',
    note: 'Small but the most valuable audience on the account. Build it from day one even though it fills slowly.',
  },
  'Lead Gen Form openers (not submitted)': {
    needs: 'lgf',
    basis: 'clicks',
    rate: 22,
    unit: '% of clicks',
    window: '90 days',
    next: 'Re-serve the same offer with a different angle. They were one field from converting.',
    note: 'Consistently the cheapest conversions on an account, and consistently forgotten.',
  },
  'Document ad viewers': {
    needs: 'document',
    basis: 'impressions',
    rate: 3.5,
    unit: '% of impressions',
    window: '365 days',
    next: 'Lead Gen Form tied to the same subject.',
    note: 'Read-depth is reported, so you can segment on how much they actually got through.',
  },
  'Single image ad engagers': {
    needs: 'image',
    basis: 'impressions',
    rate: 1.2,
    unit: '% of impressions',
    window: '365 days',
    next: 'Consideration content.',
    note: 'Engagement here means a click, reaction, comment or share — a broader net than clicks alone.',
  },
  'Company Page visitors': {
    needs: 'page',
    basis: 'impressions',
    rate: 0.4,
    unit: '% of impressions',
    window: '365 days',
    next: 'Brand or hiring content depending on why they came.',
    note: 'Accrues from organic activity too, so it may already have members before any spend.',
  },
};

const RUNNING = [
  { key: 'video', label: 'Video ads' },
  { key: 'document', label: 'Document ads' },
  { key: 'image', label: 'Single image ads' },
  { key: 'lgf', label: 'Lead Gen Forms' },
  { key: 'tag', label: 'Insight Tag live' },
  { key: 'page', label: 'Company Page active' },
];

/* ------------------------------------------------------------------ */

export default function RetargetingPlanner() {
  const [running, setRunning] = useState(['video', 'image', 'lgf']);
  const [impressions, setImpressions] = useState('110000');
  const [clicks, setClicks] = useState('460');
  const [rates, setRates] = useState({});
  const [linked, setLinked] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (r?.value) {
          const b = JSON.parse(r.value);
          if (b.client) setLinked(b.client);
          const on = [...running];
          if (b.insightTag === 'Yes' && !on.includes('tag')) on.push('tag');
          if (b.insightTag === 'No') {
            const i = on.indexOf('tag');
            if (i >= 0) on.splice(i, 1);
          }
          if (b.landingPages === 'No' && !on.includes('lgf')) on.push('lgf');
          if (b.assets?.includes('Report, guide or deck') && !on.includes('document')) on.push('document');
          if (b.assets?.includes('Founder or exec on camera') && !on.includes('video')) on.push('video');
          setRunning(on);
        }
        const f = await window.storage.get('forecast:current');
        if (f?.value) {
          const fc = JSON.parse(f.value);
          if (fc.budget && fc.cpm) {
            const imp = (Number(fc.budget) / Number(fc.cpm)) * 1000;
            if (Number.isFinite(imp) && imp > 0) setImpressions(String(Math.round(imp)));
          }
        }
      } catch {
        /* no brief */
      }
      loaded.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imp = Number(impressions) || 0;
  const clk = Number(clicks) || 0;

  const rows = useMemo(() => {
    return Object.entries(SOURCES).map(([name, s]) => {
      const rate = rates[name] !== undefined ? Number(rates[name]) : s.rate;
      const basis = s.basis === 'impressions' ? imp : clk;
      const perMonth = (basis * rate) / 100;
      const available = running.includes(s.needs);
      const daysTo = (target) => (perMonth > 0 ? Math.ceil((target / perMonth) * 30.4) : Infinity);
      return {
        name,
        ...s,
        rate,
        perMonth,
        available,
        daysToFloor: daysTo(FLOOR),
        daysToWorkable: daysTo(WORKABLE),
      };
    });
  }, [rates, imp, clk, running]);

  const live = rows.filter((r) => r.available && r.perMonth > 0).sort((a, b) => a.daysToFloor - b.daysToFloor);
  const blocked = rows.filter((r) => !r.available);

  /* When can the conversion layer realistically switch on? */
  const readiness = useMemo(() => {
    if (!live.length) return null;
    const first = live[0];
    const anyWorkable = live.filter((r) => Number.isFinite(r.daysToWorkable));
    const soonest = anyWorkable.length ? Math.min(...anyWorkable.map((r) => r.daysToWorkable)) : Infinity;
    return { first, soonest };
  }, [live]);

  const notes = useMemo(() => {
    const out = [];

    if (!running.includes('tag')) {
      out.push({
        level: 'blocker',
        text: 'Without the Insight Tag live, no website audience accrues at all — and it cannot be backdated. Every day it is not installed is a day of retargeting pool permanently lost.',
      });
    }
    if (!running.includes('video') && !running.includes('document')) {
      out.push({
        level: 'action',
        text: 'No video or document ads running. These build engagement pools far faster than image ads, which is what makes a conversion layer viable in month two rather than month four.',
      });
    }
    if (running.includes('lgf')) {
      out.push({
        level: 'note',
        text: 'Form openers who did not submit are the single most overlooked audience on most accounts. They were one field from converting — re-serve the same offer with a different angle.',
      });
    }
    if (readiness && Number.isFinite(readiness.soonest) && readiness.soonest > 60) {
      out.push({
        level: 'action',
        text: `At this volume the first pool takes about ${readiness.soonest} days to reach a workable size. If the client expects conversion results sooner than that, either raise awareness spend to fill pools faster or set expectations now.`,
      });
    }
    out.push({
      level: 'note',
      text: `Audiences need ${FLOOR} matched members before LinkedIn will let you target them, and closer to ${WORKABLE.toLocaleString()} before delivery is reliable enough to optimise against.`,
    });
    out.push({
      level: 'note',
      text: 'Pools decay as members fall outside the retargeting window, so a pool that stops being fed shrinks. Awareness spend is not just top-of-funnel — it is what keeps the conversion layer alive.',
    });
    return out;
  }, [running, readiness]);

  const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-GB') : '—');
  const days = (d) =>
    !Number.isFinite(d) ? 'never at this volume' : d <= 30 ? `${d} days` : `${(d / 30.4).toFixed(1)} months`;

  const toggle = (k) =>
    setRunning((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const copyPlan = () => {
    const lines = [
      `RETARGETING PLAN${linked ? ` — ${linked}` : ''}`,
      `Based on ${num(imp)} impressions and ${num(clk)} clicks per month`,
      '',
      'BUILD THESE, IN THIS ORDER',
      ...live.map(
        (r, i) =>
          `  ${i + 1}. ${r.name}\n     ~${num(r.perMonth)}/month · usable in ${days(r.daysToFloor)} · reliable in ${days(r.daysToWorkable)}\n     Window: ${r.window}\n     Serve next: ${r.next}`
      ),
      '',
      blocked.length ? 'NOT AVAILABLE YET' : '',
      ...blocked.map((r) => `  ${r.name} — needs ${RUNNING.find((x) => x.key === r.needs)?.label}`),
    ];
    navigator.clipboard?.writeText(lines.filter(Boolean).join('\n'));
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Retargeting plan</h1>
            {linked && <div className="linked">Prefilled from {linked}</div>}
          </div>
          {readiness && (
            <div className="ready">
              <span className="ready-lab">First pool usable in</span>
              <span className="ready-val">{days(readiness.first.daysToFloor)}</span>
            </div>
          )}
        </header>

        <div className="cols">
          {/* ---------------- inputs ---------------- */}
          <div className="panel inputs">
            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">A</span>
                What is running
              </h2>
              <div className="grp-body">
                <div className="ticks">
                  {RUNNING.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={running.includes(r.key) ? 'tick on' : 'tick'}
                      onClick={() => toggle(r.key)}
                    >
                      <span className="tick-box">{running.includes(r.key) ? '×' : ''}</span>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">B</span>
                Monthly volume
              </h2>
              <div className="grp-body">
                <label className="row">
                  <span className="row-label">Impressions</span>
                  <input
                    className="num"
                    type="number"
                    value={impressions}
                    onChange={(e) => setImpressions(e.target.value)}
                  />
                </label>
                <label className="row">
                  <span className="row-label">Clicks</span>
                  <input
                    className="num"
                    type="number"
                    value={clicks}
                    onChange={(e) => setClicks(e.target.value)}
                  />
                </label>
                <p className="hint">
                  Pulled from the forecast where available. Override with real figures once the
                  account has history — the estimates below are only as good as these two numbers.
                </p>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">C</span>
                Accrual rates
              </h2>
              <div className="grp-body">
                <p className="hint tight">
                  How much of the upstream volume becomes audience members. Conservative defaults —
                  replace with observed rates as soon as you have them.
                </p>
                {rows.map((r) => (
                  <label className="row" key={r.name}>
                    <span className="row-label sm">
                      {r.name}
                      <em>{r.unit}</em>
                    </span>
                    <input
                      className="num sm"
                      type="number"
                      step="0.1"
                      value={rates[r.name] !== undefined ? rates[r.name] : r.rate}
                      onChange={(e) => setRates((p) => ({ ...p, [r.name]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>

          {/* ---------------- plan ---------------- */}
          <div className="panel out">
            <section className="block">
              <div className="block-head">
                Build order
                <span className="range">soonest usable first</span>
              </div>
              {!live.length && <p className="none">Nothing selected that builds an audience.</p>}
              {live.map((r, i) => (
                <article className="pool" key={r.name}>
                  <div className="pool-top">
                    <span className="pool-n">{i + 1}</span>
                    <span className="pool-name">{r.name}</span>
                    <span className="pool-win">{r.window}</span>
                  </div>
                  <div className="pool-nums">
                    <div>
                      <span className="pn-lab">Per month</span>
                      <span className="pn-val">{num(r.perMonth)}</span>
                    </div>
                    <div>
                      <span className="pn-lab">Usable ({FLOOR})</span>
                      <span className={`pn-val${r.daysToFloor > 60 ? ' slow' : ''}`}>
                        {days(r.daysToFloor)}
                      </span>
                    </div>
                    <div>
                      <span className="pn-lab">Reliable ({WORKABLE.toLocaleString()})</span>
                      <span className={`pn-val${r.daysToWorkable > 90 ? ' slow' : ''}`}>
                        {days(r.daysToWorkable)}
                      </span>
                    </div>
                  </div>
                  <p className="pool-next">
                    <strong>Serve next:</strong> {r.next}
                  </p>
                  <p className="pool-note">{r.note}</p>
                </article>
              ))}
            </section>

            {blocked.length > 0 && (
              <section className="block">
                <div className="block-head">Not available yet</div>
                {blocked.map((r) => (
                  <div className="blocked" key={r.name}>
                    <span className="blocked-name">{r.name}</span>
                    <span className="blocked-need">
                      needs {RUNNING.find((x) => x.key === r.needs)?.label}
                    </span>
                  </div>
                ))}
              </section>
            )}

            <ul className="issues">
              {notes.map((n, i) => (
                <li key={i} className={`issue ${n.level}`}>
                  <span className="issue-tag">{n.level}</span>
                  {n.text}
                </li>
              ))}
            </ul>

            <div className="foot">
              <button type="button" className="btn" onClick={copyPlan} disabled={!live.length}>
                Copy plan
              </button>
              <span className="foot-note">
                Fill times are estimates from the rates above, not promises. Check actual audience
                sizes in Campaign Manager once the campaigns have run a fortnight.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
.masthead{max-width:1160px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-bottom:none;padding:16px 22px 14px;display:flex;align-items:center;
  justify-content:space-between;gap:20px;flex-wrap:wrap;}
.ready{border:2.5px solid var(--carbon);color:var(--carbon);padding:7px 15px;text-align:center;flex:none;}
.ready-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.16em;text-transform:uppercase;opacity:.85;}
.ready-val{display:block;font-family:'Courier Prime',monospace;font-weight:700;font-size:19px;
  margin-top:2px;}
.cols{max-width:1160px;margin:0 auto;display:grid;grid-template-columns:.8fr 1fr;align-items:start;}
.ticks{display:flex;flex-direction:column;gap:6px;}
.tick{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--ink-2);
  background:none;border:none;padding:2px 0;cursor:pointer;text-align:left;}
.tick-box{width:14px;height:14px;flex:none;border:1px solid var(--rule);background:var(--white);
  font-family:'Courier Prime',monospace;font-size:13px;line-height:12px;color:var(--carbon);
  text-align:center;}
.tick.on{color:var(--ink);}
.tick.on .tick-box{border-color:var(--carbon);}
.tick:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.row-label.sm{font-size:10px;letter-spacing:.06em;text-transform:none;
  font-family:'Archivo',sans-serif;font-weight:500;line-height:1.35;}
.row-label em{display:block;font-style:normal;font-size:9px;color:var(--carbon);
  opacity:.7;margin-top:1px;}
.num{width:92px;font-family:'Courier Prime',monospace;font-size:14px;color:var(--carbon);
  background:transparent;border:none;border-bottom:1px solid var(--rule);
  padding:2px 0 3px;text-align:right;border-radius:0;outline:none;}
.num.sm{width:56px;font-size:12.5px;}
.hint{margin:11px 0 0;font-size:11px;line-height:1.5;color:var(--ink-2);}
.hint.tight{margin:0 0 8px;}
.pool{padding:10px 0;border-bottom:1px dotted var(--rule-2);}
.pool:last-child{border-bottom:none;}
.pool-top{display:flex;align-items:baseline;gap:8px;margin-bottom:7px;}
.pool-n{width:17px;height:17px;flex:none;display:grid;place-items:center;
  background:var(--carbon);color:var(--white);font-family:'Courier Prime',monospace;
  font-size:11px;align-self:center;}
.pool-name{font-size:13px;font-weight:600;flex:1;min-width:0;}
.pool-win{font-family:'Courier Prime',monospace;font-size:10.5px;color:#93803C;
  border:1px solid var(--rule-2);padding:1px 6px;white-space:nowrap;}
.pool-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;}
.pn-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.15em;text-transform:uppercase;color:#93803C;margin-bottom:2px;}
.pn-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:14px;color:var(--carbon);}
.pn-val.slow{color:var(--stamp);}
.pool-next{margin:0 0 4px;font-size:12.5px;line-height:1.5;color:#4E4A33;}
.pool-next strong{font-weight:600;color:var(--ink);}
.pool-note{margin:0;font-size:11.5px;line-height:1.5;color:#7A6A3E;}
.blocked{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  padding:5px 0;border-bottom:1px dotted var(--rule-2);opacity:.65;}
.blocked:last-child{border-bottom:none;}
.blocked-name{font-size:12.5px;}
.blocked-need{font-family:'Courier Prime',monospace;font-size:11px;color:#93803C;white-space:nowrap;}
.foot{display:flex;align-items:center;gap:11px;padding:13px 16px;flex-wrap:wrap;}
@media (max-width:900px){
  .sheet{padding:10px;}
  .cols{grid-template-columns:1fr;}
  .inputs{border-right:1px solid var(--ink);}
  .out{position:static;max-height:none;border-top:none;}
  .masthead{flex-direction:column;align-items:flex-start;}
  .ready{align-self:flex-end;}
}
`;
