'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

/* ------------------------------------------------------------------ *
 * The checklist.
 *
 * `blocker: true` means do not launch until it is cleared.
 * `when` hides items that do not apply to this particular brief, so the
 * list stays short enough that people actually read it.
 * ------------------------------------------------------------------ */
const ITEMS = [
  /* ---- tracking ---- */
  {
    id: 'tag-live',
    section: 'Tracking',
    label: 'Insight Tag installed site-wide and showing Verified',
    why: 'Campaign Manager shows the domain as Unverified for up to 48 hours. Launching before it flips means losing the first days of conversion and retargeting data permanently.',
    blocker: true,
  },
  {
    id: 'conv-actions',
    section: 'Tracking',
    label: 'Conversion actions created and attached to each campaign',
    why: 'Conversions only record once linked to a specific campaign. A defined-but-unattached conversion silently counts nothing.',
    blocker: true,
  },
  {
    id: 'test-click',
    section: 'Tracking',
    label: 'Test click fired and confirmed in analytics',
    why: 'The only way to know the whole chain works before real money moves through it.',
    blocker: true,
  },
  {
    id: 'utms',
    section: 'Tracking',
    label: 'UTMs on every destination URL, lowercase and consistent',
    why: 'LinkedIn has no URL macros, so each link is hand-built and each one is a chance to typo. GA4 treats differing cases as separate sources.',
    blocker: true,
  },
  {
    id: 'attribution',
    section: 'Tracking',
    label: 'Attribution window agreed with the client',
    why: 'Sets expectations before the first report, not after they query the numbers.',
  },
  {
    id: 'capi',
    section: 'Tracking',
    label: 'Conversions API considered if browser tracking looks thin',
    why: 'Ad blockers and browser restrictions stop the Insight Tag firing. Server-side events fill the gap.',
  },

  /* ---- targeting ---- */
  {
    id: 'expansion-off',
    section: 'Targeting',
    label: 'Audience Expansion switched OFF',
    why: 'LinkedIn turns this on by default. It quietly widens targeting beyond what you set and is the single most common cause of unexplained irrelevant reach.',
    blocker: true,
  },
  {
    id: 'audience-network',
    section: 'Targeting',
    label: 'LinkedIn Audience Network set deliberately, not left on default',
    why: 'Also on by default. Fine for reach, poor for lead quality — decide, do not inherit.',
    blocker: true,
  },
  {
    id: 'size',
    section: 'Targeting',
    label: 'Audience size sits in a workable range',
    why: 'Below 50k delivery stalls and frequency spikes. Above ~500k spend scatters on conversion objectives.',
  },
  {
    id: 'exclusions',
    section: 'Targeting',
    label: 'Exclusions applied — existing customers, competitors, own staff',
    why: 'Paying to advertise to people already under contract is the easiest waste to prevent and the most embarrassing to explain.',
  },
  {
    id: 'location-type',
    section: 'Targeting',
    label: 'Location set to permanent location, not recent',
    why: 'Recent location includes anyone who has passed through. For B2B you almost always want where people actually work.',
  },
  {
    id: 'company-list',
    section: 'Targeting',
    label: 'Company list uploaded and match rate checked',
    why: 'Company lists typically match 70–90%. A much lower rate means the file needs LinkedIn Page URLs adding.',
    when: (b) => b.targetAccountList === 'Yes',
  },

  /* ---- budget ---- */
  {
    id: 'min-daily',
    section: 'Budget & schedule',
    label: 'Every campaign funded at £10/day or more',
    why: 'Below this, campaigns never accumulate enough data to optimise and delivery becomes erratic.',
    blocker: true,
  },
  {
    id: 'bid-strategy',
    section: 'Budget & schedule',
    label: 'Bid strategy chosen deliberately',
    why: 'Maximum Delivery is the default and will spend the budget regardless of efficiency. Cost cap is usually the safer opening position.',
    blocker: true,
  },
  {
    id: 'dates',
    section: 'Budget & schedule',
    label: 'Start and end dates set',
    why: 'A campaign with no end date runs until somebody notices. That somebody is usually the client.',
    blocker: true,
  },
  {
    id: 'schedule',
    section: 'Budget & schedule',
    label: 'Delivery hours agreed',
    why: 'B2B accounts typically lose 20–35% of spend to weekends and overnight. LinkedIn has no native dayparting, so this is a manual decision.',
  },
  {
    id: 'freq-cap',
    section: 'Budget & schedule',
    label: 'Frequency cap set',
    why: 'Without one, engagement decays and negative feedback climbs as the same people see the ad repeatedly.',
    when: (b) => b.objective === 'Brand awareness',
  },

  /* ---- creative ---- */
  {
    id: 'char-limits',
    section: 'Creative',
    label: 'Copy within limits and truncation previewed on mobile',
    why: '70-character headline, 150-character intro. Desktop and mobile truncate at different points — check the one your audience actually uses.',
    blocker: true,
  },
  {
    id: 'specs',
    section: 'Creative',
    label: 'Assets match format specs',
    why: 'Wrong ratios get cropped in-feed, usually through the logo or the face.',
  },
  {
    id: 'variants',
    section: 'Creative',
    label: 'At least two creative variants per campaign',
    why: 'One creative gives you nothing to learn from and no way to rotate out of fatigue.',
  },
  {
    id: 'lp-mobile',
    section: 'Creative',
    label: 'Landing page loads and works on mobile',
    why: 'Most LinkedIn traffic is mobile. A desktop-only page wastes every click.',
    when: (b) => b.landingPages === 'Yes',
  },
  {
    id: 'lp-match',
    section: 'Creative',
    label: 'Landing page delivers what the ad promised',
    why: 'Mismatch between ad and page is the most common cause of high CTR with no conversions.',
    when: (b) => b.landingPages === 'Yes',
  },

  /* ---- forms & routing ---- */
  {
    id: 'form-fields',
    section: 'Forms & routing',
    label: 'Lead Gen Form kept to three or four fields',
    why: 'Every extra field costs completions. Twelve is the ceiling, not the target.',
    when: (b) => b.landingPages !== 'Yes',
  },
  {
    id: 'form-privacy',
    section: 'Forms & routing',
    label: 'Privacy policy URL added to the form',
    why: 'LinkedIn requires it and the form will not run without one. Also a GDPR obligation, not a formality.',
    blocker: true,
    when: (b) => b.landingPages !== 'Yes',
  },
  {
    id: 'form-thanks',
    section: 'Forms & routing',
    label: 'Thank-you message and follow-on CTA set',
    why: 'The confirmation screen is the one moment you have their full attention. Do not waste it on "Thanks".',
    when: (b) => b.landingPages !== 'Yes',
  },
  {
    id: 'lead-delivery',
    section: 'Forms & routing',
    label: 'Lead delivery tested end to end',
    why: 'Submit a real test lead and confirm it arrives where a human will see it. Do this before launch, not after the first complaint.',
    blocker: true,
  },
  {
    id: 'crm-sync',
    section: 'Forms & routing',
    label: 'CRM sync live or export schedule agreed',
    why: 'The classic silent failure: leads accumulate inside LinkedIn and nobody looks. By the time anyone checks, they are cold.',
    blocker: true,
  },
  {
    id: 'follow-up-owner',
    section: 'Forms & routing',
    label: 'Named owner and response time agreed',
    why: 'Speed to first contact matters more than almost anything else downstream. "Sales will handle it" is not an owner.',
    blocker: true,
  },

  /* ---- access & compliance ---- */
  {
    id: 'billing',
    section: 'Access & compliance',
    label: 'Billing set up and payment method valid',
    why: 'A declined card pauses everything mid-flight, and recovery is not instant.',
    blocker: true,
  },
  {
    id: 'page-access',
    section: 'Access & compliance',
    label: 'Page admin and ad account access confirmed',
    why: 'Sponsored Content needs Page access. Discovering this on launch day costs a day.',
    blocker: true,
  },
  {
    id: 'special-category',
    section: 'Access & compliance',
    label: 'Special ad category declared where it applies',
    why: 'Employment, housing and credit ads face restricted targeting. Undeclared campaigns get pulled.',
  },
  {
    id: 'eu-messaging',
    section: 'Access & compliance',
    label: 'EU Sponsored Messaging opt-in requirement understood',
    why: 'EU members must have opted in before they can receive Message or Conversation Ads, so reachable volume is far smaller than the raw audience suggests.',
    when: (b) => /\b(eu|europe|germany|france|spain|italy|netherlands|ireland|poland|belgium|austria)\b/i.test(b.markets || ''),
  },
  {
    id: 'brand-signoff',
    section: 'Access & compliance',
    label: 'Client sign-off on final creative and copy',
    why: 'In writing. Verbal approval on a call is not a record.',
    blocker: true,
  },
];

const SECTIONS = [
  'Tracking',
  'Targeting',
  'Budget & schedule',
  'Creative',
  'Forms & routing',
  'Access & compliance',
];

/* ------------------------------------------------------------------ */

export default function QAChecklist() {
  const [done, setDone] = useState({});
  const [na, setNa] = useState({});
  const [brief, setBrief] = useState({});
  const [linked, setLinked] = useState(null);
  const [open, setOpen] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (r?.value) {
          const b = JSON.parse(r.value);
          setBrief(b);
          if (b.client) setLinked(b.client);
        }
      } catch {
        /* no brief */
      }
      try {
        const q = await window.storage.get('qa:current');
        if (q?.value) {
          const parsed = JSON.parse(q.value);
          setDone(parsed.done || {});
          setNa(parsed.na || {});
        }
      } catch {
        /* no saved progress */
      }
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      window.storage?.set('qa:current', JSON.stringify({ done, na })).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [done, na]);

  const active = useMemo(() => ITEMS.filter((i) => !i.when || i.when(brief)), [brief]);

  const stats = useMemo(() => {
    const counted = active.filter((i) => !na[i.id]);
    const blockers = counted.filter((i) => i.blocker);
    return {
      total: counted.length,
      done: counted.filter((i) => done[i.id]).length,
      blockersTotal: blockers.length,
      blockersDone: blockers.filter((i) => done[i.id]).length,
      outstanding: blockers.filter((i) => !done[i.id]),
    };
  }, [active, done, na]);

  const cleared = stats.blockersTotal > 0 && stats.outstanding.length === 0;
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  const toggle = (id) => setDone((p) => ({ ...p, [id]: !p[id] }));
  const toggleNa = (id) =>
    setNa((p) => {
      const next = { ...p, [id]: !p[id] };
      if (next[id]) setDone((d) => ({ ...d, [id]: false }));
      return next;
    });

  const reset = () => {
    if (confirm('Clear all ticks and start this checklist again?')) {
      setDone({});
      setNa({});
    }
  };

  const copyReport = () => {
    const lines = [
      `PRE-LAUNCH QA — ${linked || 'Unnamed client'}`,
      `${new Date().toLocaleDateString('en-GB')} · ${stats.done}/${stats.total} complete · ${cleared ? 'CLEARED FOR LAUNCH' : `${stats.outstanding.length} blocker(s) outstanding`}`,
      '',
      ...SECTIONS.flatMap((s) => {
        const items = active.filter((i) => i.section === s);
        if (!items.length) return [];
        return [
          s.toUpperCase(),
          ...items.map(
            (i) =>
              `  [${na[i.id] ? 'n/a' : done[i.id] ? 'x' : ' '}] ${i.label}${i.blocker && !done[i.id] && !na[i.id] ? '  ** BLOCKER **' : ''}`
          ),
          '',
        ];
      }),
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
            <h1 className="mast-title">Pre-launch QA</h1>
            {linked && <div className="linked">Checklist for {linked}</div>}
          </div>
          <div className={`stamp${cleared ? ' cleared' : ''}`}>
            <span className="stamp-main">{cleared ? 'Cleared' : 'Not cleared'}</span>
            <span className="stamp-sub">
              {cleared ? 'for launch' : `${stats.outstanding.length} blocker${stats.outstanding.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </header>

        <div className="bar-wrap">
          <div className="bar">
            <div className="bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="bar-meta">
            <span>
              {stats.done} of {stats.total} checked
            </span>
            <span>
              Blockers {stats.blockersDone}/{stats.blockersTotal}
            </span>
          </div>
        </div>

        {stats.outstanding.length > 0 && (
          <div className="outstanding">
            <span className="out-tag">Outstanding blockers</span>
            <ul>
              {stats.outstanding.map((i) => (
                <li key={i.id}>{i.label}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="list">
          {SECTIONS.map((s) => {
            const items = active.filter((i) => i.section === s);
            if (!items.length) return null;
            const sDone = items.filter((i) => done[i.id] || na[i.id]).length;
            return (
              <section className="sec" key={s}>
                <h2 className="sec-head">
                  {s}
                  <span className="sec-count">
                    {sDone}/{items.length}
                  </span>
                </h2>
                {items.map((i) => {
                  const isNa = !!na[i.id];
                  const isDone = !!done[i.id];
                  return (
                    <div
                      className={`item${isDone ? ' done' : ''}${isNa ? ' na' : ''}${i.blocker && !isDone && !isNa ? ' blocking' : ''}`}
                      key={i.id}
                    >
                      <button
                        type="button"
                        className="box"
                        onClick={() => !isNa && toggle(i.id)}
                        aria-pressed={isDone}
                        aria-label={i.label}
                        disabled={isNa}
                      >
                        {isNa ? '–' : isDone ? '×' : ''}
                      </button>
                      <div className="item-body">
                        <div className="item-top">
                          <span className="item-label">{i.label}</span>
                          {i.blocker && <span className="pill">blocker</span>}
                          <button
                            type="button"
                            className="why-btn"
                            onClick={() => setOpen(open === i.id ? null : i.id)}
                            aria-expanded={open === i.id}
                          >
                            {open === i.id ? 'Hide' : 'Why'}
                          </button>
                          <button
                            type="button"
                            className={`na-btn${isNa ? ' on' : ''}`}
                            onClick={() => toggleNa(i.id)}
                          >
                            N/A
                          </button>
                        </div>
                        {open === i.id && <p className="why">{i.why}</p>}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        <footer className="foot">
          <button type="button" className="btn" onClick={copyReport}>
            Copy report
          </button>
          <button type="button" className="btn ghost" onClick={reset}>
            Reset
          </button>
          <span className="foot-note">
            Items marked N/A are excluded from the counts. Some items are hidden automatically
            where the brief says they do not apply.
          </span>
        </footer>
      </div>
    </>
  );
}

const CSS = `
.masthead,.bar-wrap,.outstanding,.list,.foot{max-width:940px;margin-left:auto;margin-right:auto;}
.stamp{border:2.5px solid var(--stamp);color:var(--stamp);padding:7px 16px;
  transform:rotate(-3deg);text-align:center;flex:none;}
.stamp.cleared{border-color:var(--ok);color:var(--ok);}
.stamp-main{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:19px;letter-spacing:.13em;text-transform:uppercase;line-height:1.05;}
.stamp-sub{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9.5px;letter-spacing:.17em;text-transform:uppercase;opacity:.85;margin-top:2px;}
.bar-wrap{background:var(--white);border-left:1px solid var(--ink);border-right:1px solid var(--ink);
  border-bottom:1px solid var(--rule);padding:11px 22px 13px;}
.bar{height:7px;background:#E6E4DA;}
.bar-fill{height:100%;background:var(--carbon);transition:width .2s ease-out;}
.bar-meta{display:flex;justify-content:space-between;margin-top:6px;
  font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--ink-2);}
.outstanding{background:#F7E9C8;border-left:1px solid var(--ink);border-right:1px solid var(--ink);
  border-bottom:1px solid var(--rule);padding:11px 22px 13px;}
.out-tag{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.2em;text-transform:uppercase;color:var(--stamp);margin-bottom:5px;}
.outstanding ul{margin:0;padding-left:17px;}
.outstanding li{font-size:12.5px;line-height:1.55;color:#5C3128;}
.list{background:var(--white);border-left:1px solid var(--ink);border-right:1px solid var(--ink);}
.sec{border-bottom:1px solid var(--rule);}
.sec:last-child{border-bottom:none;}
.sec-head{display:flex;align-items:center;justify-content:space-between;margin:0;
  padding:9px 22px;background:#F3F2EC;border-bottom:1px solid var(--rule);
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11.5px;
  letter-spacing:.15em;text-transform:uppercase;}
.sec-count{font-family:'Courier Prime',monospace;font-size:12px;letter-spacing:0;color:var(--ink-2);}
.item{display:grid;grid-template-columns:auto 1fr;gap:11px;padding:9px 22px;
  border-bottom:1px dotted var(--rule);}
.item:last-child{border-bottom:none;}
.item.blocking{background:#FBF6EC;}
.item.done{background:#F4F7F2;}
.item.na{opacity:.5;}
.box{width:19px;height:19px;flex:none;margin-top:1px;border:1.5px solid var(--rule);
  background:var(--white);font-family:'Courier Prime',monospace;font-size:16px;line-height:15px;
  color:var(--carbon);cursor:pointer;padding:0;}
.item.blocking .box{border-color:var(--stamp);}
.item.done .box{border-color:var(--ok);color:var(--ok);}
.box:disabled{cursor:default;}
.box:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.item-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
.item-label{font-size:13.5px;line-height:1.45;flex:1;min-width:200px;}
.item.done .item-label{color:var(--ink-2);}
.pill{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--stamp);
  border:1px solid var(--stamp);padding:1px 5px;}
.item.done .pill{color:var(--ok);border-color:var(--ok);}
.why-btn,.na-btn{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.13em;text-transform:uppercase;background:none;border:1px solid var(--rule);
  color:var(--ink-2);padding:2px 7px;cursor:pointer;}
.why-btn:hover,.na-btn:hover{background:#F1F0EA;color:var(--ink);}
.na-btn.on{background:var(--ink-2);color:var(--white);border-color:var(--ink-2);}
.why-btn:focus-visible,.na-btn:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.why{margin:7px 0 2px;font-size:12.5px;line-height:1.55;color:#4E4A33;
  border-left:2px solid var(--rule-2);padding-left:10px;}
.foot{background:#F3F2EC;border:1px solid var(--ink);padding:13px 22px;
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.btn.ghost:hover{background:var(--white);color:var(--ink);}
.foot-note{font-size:10.5px;line-height:1.45;color:var(--ink-2);flex:1;min-width:220px;}
@media (max-width:700px){
  .sheet{padding:10px;}
  .masthead{flex-direction:column;align-items:flex-start;}
  .stamp{transform:none;align-self:flex-end;}
  .item{padding:9px 14px;}
  .sec-head,.bar-wrap,.outstanding,.foot{padding-left:14px;padding-right:14px;}
}
@media (prefers-reduced-motion:reduce){.bar-fill{transition:none;}}
`;
