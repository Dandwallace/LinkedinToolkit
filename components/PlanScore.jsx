'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

/* ------------------------------------------------------------------ *
 * Best practice score, driven by sliders.
 *
 * The reason for dragging rather than typing: several criteria depend on
 * each other. Budget adequacy depends on campaign count; whether a lead
 * target is realistic depends on budget. Each slider draws a band showing
 * where it would earn the best available score — and those bands move as
 * you drag the others. The interdependency becomes visible rather than
 * something you discover later in a deduction.
 * ------------------------------------------------------------------ */

const MIN_DAILY = 10;
const DAYS = 30.4;

/* LinkedIn's learning phase runs roughly 1–2 weeks after launch or after
 * any significant edit. Two weeks is the conservative planning figure. */
const LEARNING_WEEKS = 2;

const BLANK = {
  budget: 5000,
  weeks: 12,
  campaignType: 'Fixed-term campaign',
  campaigns: 4,
  audienceSize: 120000,
  variantsPerCampaign: 2,
  formFields: 4,
  targetLeads: 60,
  dealSize: 12000,
  stages: 'Full funnel',
  capture: 'Lead Gen Form',
  formats: ['Single image'],
  retargetingPlanned: '',
  exclusionsPlanned: '',
  accountList: 'Not available',
  tagPlanned: '',
  crmPlanned: '',
  namingDefined: '',
  testPlan: '',
  dayparting: '',
  creativeBudgeted: '',
};

const FORMATS = [
  'Single image', 'Carousel', 'Video', 'Document', 'Thought leader',
  'Conversation', 'Message', 'Spotlight', 'Text ad', 'Event',
];

/* LinkedIn's technical minimum is £10/day. The practical B2B minimum is
 * far higher: a campaign needs roughly 5–10 clicks a day to accumulate
 * usable data, which at typical B2B CPCs lands at £75–150/day. Budgets
 * between the two floors technically run and functionally starve. */
const PRACTICAL_DAILY = 75;
const THIN_DAILY = 50;

const CRITERIA = [
  {
    id: 'daily', section: 'Structure', label: 'Campaigns funded to gather data', weight: 10,
    score: (a) => {
      const daily = a.budget / DAYS / Math.max(a.campaigns, 1);
      const d = `£${daily.toFixed(0)}/day per campaign`;
      if (daily >= PRACTICAL_DAILY) return { s: 1 };
      if (daily >= THIN_DAILY) return { s: 0.6, why: `${d} sits just under the £${PRACTICAL_DAILY}–150 range where B2B campaigns gather enough clicks to optimise. Workable, but learning will be slow.` };
      if (daily >= 25) return { s: 0.35, why: `${d} is well below the practical B2B floor. Splitting £10,000 across five campaigns leaves each at about £65/day — a documented failure pattern, and this is thinner still.` };
      if (daily >= MIN_DAILY) return { s: 0.15, why: `${d} clears LinkedIn's £${MIN_DAILY} technical minimum but will not generate enough daily clicks to leave the learning phase. Concentrate the spend.` };
      return { s: 0, why: `${d} sits below LinkedIn's £${MIN_DAILY} minimum. Delivery will be erratic or absent.` };
    },
  },
  {
    id: 'runway', section: 'Structure', label: 'Runway suits the campaign type', weight: 8,
    score: (a) => {
      const w = a.weeks;
      const productive = w - LEARNING_WEEKS;
      const tail = `${w} week${w === 1 ? '' : 's'} leaves about ${productive} productive week${productive === 1 ? '' : 's'} after the 1–2 week learning phase.`;

      if (w < 1) return { s: 0, why: 'No duration set.' };
      if (w * 7 < 7) return { s: 0, why: "Below LinkedIn's own recommended minimum of seven days." };

      if (a.campaignType === 'Event or launch') {
        if (w >= 4 && w <= 12) return { s: 1 };
        if (w > 12) return { s: 0.8, why: `${w} weeks is long for an event push. Fine if it is a phased build, but audiences fatigue on a fixed message — plan creative rotation.` };
        if (w >= 2) return { s: 0.7, why: `${tail} Workable for an event, though four to six weeks of lead time consistently performs better.` };
        return { s: 0.4, why: `${tail} You will be optimising on almost no data. Consider extending the lead time or accepting this as pure reach.` };
      }

      if (a.campaignType === 'Fixed-term campaign') {
        if (w >= 12) return { s: 1 };
        if (w >= 8) return { s: 0.85, why: `${tail} Enough to gather real signal and optimise. Longer would let more of the sales cycle land inside the window.` };
        if (w >= 4) return { s: 0.6, why: `${tail} Enough to learn from, but a B2B sales cycle will run past the campaign end — measure on leads, not closed revenue.` };
        return { s: 0.35, why: `${tail} Above LinkedIn's seven-day minimum, but too short to optimise meaningfully. Treat any result as directional.` };
      }

      /* Always-on programme */
      if (w >= 26) return { s: 1 };
      if (w >= 12) return { s: 0.75, why: `${w} weeks is a campaign, not a programme. Always-on works because pools compound and learning is not repeatedly reset — under six months you lose most of that.` };
      if (w >= 4) return { s: 0.45, why: `${tail} If this is meant to be always-on, the budget is committed for too short a window to behave like it.` };
      return { s: 0.2, why: `${tail} Far too short for an always-on programme.` };
    },
  },
  {
    id: 'funnel', section: 'Structure', label: 'Funnel matches audience temperature', weight: 9,
    score: (a) => {
      if (a.stages === 'Full funnel') return { s: 1 };
      const event = a.campaignType === 'Event or launch';
      if (a.stages === 'Consideration + conversion') {
        return event
          ? { s: 0.9, why: 'Reasonable for a dated campaign. Watch that the pool you are retargeting was actually built recently enough to still be warm.' }
          : { s: 0.7, why: 'No awareness layer means the retargeting pool never refills — conversion decays as the existing pool empties.' };
      }
      return event
        ? { s: 0.6, why: 'Defensible against a hard date, but even two weeks of awareness ahead of the push lifts registration rates. Only skip it if a warm pool already exists.' }
        : { s: 0.2, why: 'Conversion-only against a cold audience is the most common way to burn a LinkedIn budget. It works only where a warm pool already exists.' };
    },
  },
  {
    id: 'count', section: 'Structure', label: 'Spend concentrated, not spread thin', weight: 6,
    score: (a) => {
      const daily = a.budget / DAYS;
      const ideal = Math.max(1, Math.floor(daily / PRACTICAL_DAILY));
      const workable = Math.max(1, Math.floor(daily / THIN_DAILY));
      if (a.campaigns <= ideal) return { s: 1 };
      if (a.campaigns <= workable) return { s: 0.6, why: `${a.campaigns} campaigns stretches this budget. £${a.budget.toLocaleString()}/month properly funds about ${ideal}. Fewer campaigns with more behind each outperform more campaigns running thin.` };
      return { s: 0, why: `${a.campaigns} campaigns against a budget that properly funds ${ideal}. Two or three well-funded campaigns beat this every time — consolidate before launch, not after a month of flat results.` };
    },
  },
  {
    id: 'funnelfunding', section: 'Structure', label: 'Budget supports the planned funnel', weight: 7,
    score: (a) => {
      const daily = a.budget / DAYS;
      const needed = a.stages === 'Full funnel' ? 3 : a.stages === 'Consideration + conversion' ? 2 : 1;
      const affordable = Math.floor(daily / PRACTICAL_DAILY);
      if (affordable >= needed) return { s: 1 };
      const required = Math.ceil((needed * PRACTICAL_DAILY * DAYS) / 250) * 250;
      return {
        s: 0,
        why: `A ${a.stages.toLowerCase()} needs at least ${needed} properly funded campaigns. This budget funds about ${affordable}. Either raise it to roughly £${required.toLocaleString()}/month or run fewer stages properly — a starved three-stage funnel performs worse than a well-fed single stage.`,
      };
    },
  },
  {
    id: 'size', section: 'Audience', label: 'Audience size in a workable range', weight: 8,
    score: (a) => {
      if (a.audienceSize < 50000) return { s: 0.2, why: `${a.audienceSize.toLocaleString()} is below the 50k mark where delivery stalls and frequency spikes.` };
      if (a.audienceSize > 500000) return { s: 0.4, why: `${a.audienceSize.toLocaleString()} is broad. Fine for awareness, but conversion spend will scatter — layer company size or seniority.` };
      return { s: 1 };
    },
  },
  {
    id: 'retarget', section: 'Audience', label: 'Retargeting layer planned', weight: 8,
    score: (a) => a.retargetingPlanned === 'Yes' ? { s: 1 }
      : { s: 0, why: 'Without retargeting every impression is a first impression. This is where most of the efficiency in a LinkedIn account comes from.' },
  },
  {
    id: 'exclusions', section: 'Audience', label: 'Exclusions planned', weight: 5,
    score: (a) => a.exclusionsPlanned === 'Yes' ? { s: 1 }
      : { s: 0, why: "No exclusions means paying to reach existing customers, competitors and the client's own staff." },
  },
  {
    id: 'accountlist', section: 'Audience', label: 'Account list used where available', weight: 4,
    score: (a) => {
      if (a.accountList === 'Not available') return { s: 1, na: true };
      if (a.accountList === 'Yes') return { s: 1 };
      return { s: 0, why: 'An account list exists but is unused. Company lists match at 70–90% and are the strongest targeting signal available.' };
    },
  },
  {
    id: 'variants', section: 'Creative', label: 'Enough creative to rotate and learn', weight: 6,
    score: (a) => {
      if (a.variantsPerCampaign >= 3) return { s: 1 };
      if (a.variantsPerCampaign === 2) return { s: 0.7, why: 'Two variants lets you test but leaves nothing in reserve when both fatigue.' };
      return { s: 0, why: 'One creative per campaign gives nothing to learn from and no way out of fatigue.' };
    },
  },
  {
    id: 'poolbuilders', section: 'Creative', label: 'Formats that build pools quickly', weight: 7,
    score: (a) => {
      const fast = a.formats.filter((f) => ['Video', 'Document', 'Thought leader'].includes(f));
      if (fast.length >= 2) return { s: 1 };
      if (fast.length === 1) return { s: 0.7, why: 'Only one pool-building format. Video and document ads accrue audiences several times faster than image ads.' };
      return { s: 0, why: 'No video, document or thought leader ads. Retargeting pools fill slowly, pushing the conversion layer months out.' };
    },
  },
  {
    id: 'capture', section: 'Creative', label: 'Capture method chosen deliberately', weight: 6,
    score: (a) => (a.capture === 'Landing page')
      ? { s: 0.4, why: 'Landing pages convert at roughly a third the rate of native Lead Gen Forms. Worth a deliberate reason rather than a default.' }
      : { s: 1 },
  },
  {
    id: 'fields', section: 'Creative', label: 'Form kept short', weight: 4,
    score: (a) => {
      if (a.capture === 'Landing page') return { s: 1, na: true };
      if (a.formFields <= 4) return { s: 1 };
      if (a.formFields <= 7) return { s: 0.5, why: `${a.formFields} fields will cost completions. Three or four is the practical sweet spot.` };
      return { s: 0, why: `${a.formFields} fields is a wall. Every field past the fourth costs conversions.` };
    },
  },
  {
    id: 'tracking', section: 'Measurement', label: 'Tracking in place before launch', weight: 10,
    score: (a) => a.tagPlanned === 'Yes' ? { s: 1 }
      : { s: 0, why: 'Insight Tag and conversion actions must be live before spend starts. Week-one data cannot be recovered, and no website retargeting accrues without it.' },
  },
  {
    id: 'crm', section: 'Measurement', label: 'Lead routing agreed', weight: 9,
    score: (a) => a.crmPlanned === 'Yes' ? { s: 1 }
      : { s: 0, why: 'The classic silent failure. Leads pile up inside LinkedIn, nobody looks, and by the time anyone checks they are cold.' },
  },
  {
    id: 'naming', section: 'Measurement', label: 'Naming convention defined', weight: 3,
    score: (a) => a.namingDefined === 'Yes' ? { s: 1 }
      : { s: 0, why: 'Reporting cannot be sliced by stage, audience or format if names are improvised per campaign.' },
  },
  {
    id: 'testplan', section: 'Measurement', label: 'Test plan defined upfront', weight: 5,
    score: (a) => a.testPlan === 'Yes' ? { s: 1 }
      : { s: 0, why: 'Without deciding what to test and at what sample size, every mid-flight comparison is a judgement made on noise.' },
  },
  {
    id: 'schedule', section: 'Measurement', label: 'Delivery schedule considered', weight: 3,
    score: (a) => a.dayparting === 'Yes' ? { s: 1 }
      : { s: 0.4, why: 'B2B accounts typically lose 20–35% of spend to weekends and overnight. LinkedIn has no native dayparting, so this must be deliberate.' },
  },
  {
    id: 'realistic', section: 'Commercial', label: 'Target reachable on this budget', weight: 9,
    score: (a) => {
      if (!a.targetLeads) return { s: 0.5, why: 'No lead target. Without one there is no way to tell whether the budget is adequate or the plan succeeded.' };
      const cpl = a.budget / a.targetLeads;
      if (cpl >= 80) return { s: 1 };
      if (cpl >= 45) return { s: 0.5, why: `The target implies a £${cpl.toFixed(0)} cost per lead. Achievable in some sectors, optimistic in most B2B.` };
      return { s: 0, why: `The target implies a £${cpl.toFixed(0)} cost per lead, well below typical B2B LinkedIn performance. Reset the target or the budget.` };
    },
  },
  {
    id: 'value', section: 'Commercial', label: 'Deal value supports the spend', weight: 6,
    score: (a) => {
      if (!a.dealSize) return { s: 0, why: 'No average deal size. Without it there is no way to argue the spend is worth making.' };
      if (!a.targetLeads) return { s: 0.6 };
      const cpl = a.budget / a.targetLeads;
      if (a.dealSize / cpl >= 20) return { s: 1 };
      return { s: 0.4, why: `A £${a.dealSize.toLocaleString()} deal against a £${cpl.toFixed(0)} cost per lead leaves thin margin once close rates apply.` };
    },
  },
  {
    id: 'creativebudget', section: 'Commercial', label: 'Creative production budgeted separately', weight: 4,
    score: (a) => {
      if (a.creativeBudgeted === 'Yes') return { s: 1 };
      const lo = Math.round((a.budget * 0.15) / 50) * 50;
      const hi = Math.round((a.budget * 0.25) / 50) * 50;
      return {
        s: 0,
        why: `Media spend is not the whole cost. Plan 15–25% on top for creative production — roughly £${lo.toLocaleString()}–${hi.toLocaleString()}/month here. LinkedIn's small audiences exhaust creative fast, and campaigns stall when there is nothing left to rotate in.`,
      };
    },
  },
];

const SECTIONS = ['Structure', 'Audience', 'Creative', 'Measurement', 'Commercial'];

function evaluate(a) {
  const res = CRITERIA.map((c) => ({ ...c, ...c.score(a) }));
  const scored = res.filter((r) => !r.na);
  const tw = scored.reduce((n, r) => n + r.weight, 0);
  const earned = scored.reduce((n, r) => n + r.weight * r.s, 0);
  return { res, pct: tw ? (earned / tw) * 100 : 0 };
}

const SLIDERS = [
  { key: 'budget', label: 'Monthly budget', min: 500, max: 40000, step: 250, fmt: (v) => '£' + v.toLocaleString('en-GB') },
  {
    key: 'weeks', label: 'Duration', min: 1, max: 52, step: 1,
    fmt: (v) => (v < 9 ? `${v} week${v === 1 ? '' : 's'}` : `${v} weeks · ${(v / 4.33).toFixed(1)} months`),
    learning: LEARNING_WEEKS,
  },
  { key: 'campaigns', label: 'Campaigns', min: 1, max: 20, step: 1, fmt: (v) => String(v) },
  { key: 'audienceSize', label: 'Audience size', min: 5000, max: 900000, step: 5000, fmt: (v) => v.toLocaleString('en-GB') },
  { key: 'variantsPerCampaign', label: 'Creative variants each', min: 1, max: 8, step: 1, fmt: (v) => String(v) },
  { key: 'formFields', label: 'Form fields', min: 1, max: 12, step: 1, fmt: (v) => String(v), hideWhen: (a) => a.capture === 'Landing page' },
  { key: 'targetLeads', label: 'Lead target / month', min: 0, max: 300, step: 5, fmt: (v) => String(v) },
  { key: 'dealSize', label: 'Average deal size', min: 0, max: 120000, step: 1000, fmt: (v) => '£' + v.toLocaleString('en-GB') },
];

/**
 * Scans a slider's range and returns the span where the overall score is
 * at (or within a whisker of) its best. Evaluating the whole score rather
 * than one criterion means interdependencies are handled without
 * special-casing any of them.
 */
function zoneFor(slider, state, currentPct) {
  const samples = 48;
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const raw = slider.min + ((slider.max - slider.min) * i) / samples;
    const v = Math.min(slider.max, Math.max(slider.min, Math.round(raw / slider.step) * slider.step));
    points.push({ v, pct: evaluate({ ...state, [slider.key]: v }).pct });
  }
  const best = Math.max(...points.map((p) => p.pct));
  const good = points.filter((p) => p.pct >= best - 0.4);
  if (!good.length) return null;
  return {
    from: Math.min(...good.map((p) => p.v)),
    to: Math.max(...good.map((p) => p.v)),
    best,
    gain: best - currentPct,
  };
}

/* ------------------------------------------------------------------ */

function Slider({ def, value, zone, onChange }) {
  const span = def.max - def.min;
  const pos = ((value - def.min) / span) * 100;
  const zFrom = zone ? ((zone.from - def.min) / span) * 100 : 0;
  const zWidth = zone ? ((zone.to - zone.from) / span) * 100 : 0;
  const inZone = zone && value >= zone.from && value <= zone.to;
  const target = zone ? (value < zone.from ? zone.from : zone.to) : null;

  return (
    <div className="sl">
      <div className="sl-top">
        <span className="sl-label">{def.label}</span>
        <span className={`sl-val${inZone ? ' good' : ''}`}>{def.fmt(value)}</span>
      </div>
      <div className="sl-track">
        {zone && zWidth > 0 && (
          <div className="sl-zone" style={{ left: `${zFrom}%`, width: `${Math.max(zWidth, 1.5)}%` }} />
        )}
        <div className="sl-fill" style={{ width: `${pos}%` }} />
        {def.learning && (
          <div
            className="sl-learn"
            style={{ width: `${Math.min(pos, ((def.learning - def.min) / span) * 100)}%` }}
            title={`First ${def.learning} weeks are the learning phase`}
          />
        )}
        <input
          className="sl-input"
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={def.label}
        />
      </div>
      <div className="sl-hint">
        {def.learning && (
          <span className="hint-learn">
            {value <= def.learning
              ? 'All learning phase'
              : `${def.learning}wk learning + ${value - def.learning}wk optimised`}
            <i>·</i>
          </span>
        )}
        {!zone || zWidth === 0 ? (
          <span>&nbsp;</span>
        ) : inZone ? (
          <span className="hint-good">Best available here</span>
        ) : (
          <span className="hint-move">
            {value < zone.from ? 'Raise to' : 'Lower to'} {def.fmt(target)}
            {zone.gain >= 0.5 && <em>+{zone.gain.toFixed(0)}</em>}
          </span>
        )}
      </div>
    </div>
  );
}

function YesNo({ label, value, onChange, extra, gain }) {
  const opts = extra ? ['Yes', 'No', extra] : ['Yes', 'No'];
  return (
    <div className="yn">
      <span className="yn-label">
        {label}
        {gain >= 0.5 && <em>+{gain.toFixed(0)}</em>}
      </span>
      <span className="tog">
        {opts.map((o) => (
          <button key={o} type="button" className={value === o ? 'tb on' : 'tb'}
            onClick={() => onChange(value === o ? '' : o)}>{o}</button>
        ))}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function PlanScore() {
  const [a, setA] = useState(BLANK);
  const [linked, setLinked] = useState(null);
  const loaded = useRef(false);

  const set = (k) => (v) => setA((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (r?.value) {
          const b = JSON.parse(r.value);
          const p = {};
          if (b.client) setLinked(b.client);
          if (b.budget && b.months) p.budget = Math.round(Number(b.budget) / Number(b.months) / 250) * 250;
          if (b.months) p.weeks = Math.min(52, Math.round(Number(b.months) * 4.33));
          if (b.objective === 'Brand awareness') p.campaignType = 'Always-on programme';
          if (b.assets?.includes('Webinar or event')) p.campaignType = 'Event or launch';
          if (b.campaignCount) p.campaigns = Math.min(20, Number(b.campaignCount));
          if (b.audienceSize) p.audienceSize = Math.round(Number(b.audienceSize) / 5000) * 5000;
          if (b.targetLeads) p.targetLeads = Math.round(Number(b.targetLeads) / 5) * 5;
          if (b.dealSize) p.dealSize = Math.round(Number(b.dealSize) / 1000) * 1000;
          if (b.landingPages === 'Yes') p.capture = 'Landing page';
          if (b.landingPages === 'No') p.capture = 'Lead Gen Form';
          if (b.insightTag === 'Yes' && b.conversionTracking === 'Yes') p.tagPlanned = 'Yes';
          if (b.insightTag === 'No') p.tagPlanned = 'No';
          if (b.leadRouting) p.crmPlanned = b.leadRouting;
          p.accountList = b.targetAccountList === 'Yes' ? 'Yes' : 'Not available';
          const f = [];
          if (b.assets?.includes('Report, guide or deck')) f.push('Document');
          if (b.assets?.includes('Founder or exec on camera')) f.push('Thought leader');
          if (b.assets?.includes('Product video')) f.push('Video');
          if (b.assets?.includes('Brand imagery')) f.push('Single image');
          if (f.length) p.formats = f;
          setA((prev) => ({ ...prev, ...p }));
        }
      } catch { /* no brief saved */ }
      loaded.current = true;
    })();
  }, []);

  const { res, pct } = useMemo(() => evaluate(a), [a]);
  const rounded = Math.round(pct);

  const zones = useMemo(() => {
    const out = {};
    for (const s of SLIDERS) {
      if (s.hideWhen?.(a)) continue;
      out[s.key] = zoneFor(s, a, pct);
    }
    return out;
  }, [a, pct]);

  const toggleGains = useMemo(() => {
    const keys = ['retargetingPlanned', 'exclusionsPlanned', 'tagPlanned', 'crmPlanned', 'namingDefined', 'testPlan', 'dayparting', 'creativeBudgeted'];
    const out = {};
    for (const k of keys) out[k] = evaluate({ ...a, [k]: 'Yes' }).pct - pct;
    if (a.accountList === 'No') out.accountList = evaluate({ ...a, accountList: 'Yes' }).pct - pct;
    return out;
  }, [a, pct]);

  const grade =
    rounded >= 85 ? { g: 'Sound', cls: 'a' }
    : rounded >= 70 ? { g: 'Workable', cls: 'b' }
    : rounded >= 50 ? { g: 'Weak', cls: 'c' }
    : { g: 'Do not build', cls: 'd' };

  const deductions = res
    .filter((r) => !r.na && r.s < 1 && r.why)
    .map((r) => ({ ...r, lost: r.weight * (1 - r.s) }))
    .sort((x, y) => y.lost - x.lost);

  const TOGGLE_TO_CRITERION = {
    retargetingPlanned: 'retarget', exclusionsPlanned: 'exclusions', tagPlanned: 'tracking',
    crmPlanned: 'crm', namingDefined: 'naming', testPlan: 'testplan',
    dayparting: 'schedule', accountList: 'accountlist', creativeBudgeted: 'creativebudget',
  };

  const bestMove = useMemo(() => {
    const moves = [];
    for (const [k, z] of Object.entries(zones)) {
      if (z && z.gain >= 0.5) {
        const def = SLIDERS.find((s) => s.key === k);
        const target = a[k] < z.from ? z.from : z.to;
        moves.push({ gain: z.gain, text: `Move ${def.label.toLowerCase()} to ${def.fmt(target)}` });
      }
    }
    for (const [k, g] of Object.entries(toggleGains)) {
      if (g >= 0.5) {
        const c = CRITERIA.find((x) => x.id === TOGGLE_TO_CRITERION[k]);
        moves.push({ gain: g, text: c ? c.label : k });
      }
    }
    if (a.stages !== 'Full funnel') {
      moves.push({ gain: evaluate({ ...a, stages: 'Full funnel' }).pct - pct, text: 'Plan a full funnel' });
    }
    const fast = a.formats.filter((f) => ['Video', 'Document', 'Thought leader'].includes(f));
    if (fast.length < 2) {
      const add = ['Video', 'Document', 'Thought leader'].filter((f) => !a.formats.includes(f)).slice(0, 2 - fast.length);
      if (add.length) {
        moves.push({
          gain: evaluate({ ...a, formats: [...a.formats, ...add] }).pct - pct,
          text: `Add ${add.join(' and ').toLowerCase()} to the format mix`,
        });
      }
    }
    return moves.filter((m) => m.gain >= 0.5).sort((x, y) => y.gain - x.gain)[0] || null;
  }, [zones, toggleGains, a, pct]);

  const toggleFormat = (f) =>
    setA((p) => ({ ...p, formats: p.formats.includes(f) ? p.formats.filter((x) => x !== f) : [...p.formats, f] }));

  const copyReport = () => {
    const lines = [
      `CAMPAIGN PLAN SCORE${linked ? ` — ${linked}` : ''}`,
      `${rounded}% — ${grade.g}`,
      '',
      'BIGGEST GAPS',
      ...deductions.slice(0, 6).map((d) => `  ${d.label} (−${d.lost.toFixed(0)})\n    ${d.why}`),
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
            <h1 className="mast-title">Plan score</h1>
            {linked && <div className="linked">Prefilled from {linked}</div>}
          </div>
          <div className={`grade ${grade.cls}`}>
            <span className="grade-pct">{rounded}%</span>
            <span className="grade-g">{grade.g}</span>
          </div>
        </header>

        {bestMove && (
          <div className="best">
            <span className="best-tag">Biggest single win</span>
            <span className="best-text">{bestMove.text}</span>
            <em>+{bestMove.gain.toFixed(0)} points</em>
          </div>
        )}

        <div className="cols">
          {/* ---------------- sliders ---------------- */}
          <div className="panel inputs">
            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">A</span>
                Shape
                <span className="grp-note">green band = best available</span>
              </h2>
              <div className="grp-body">
                <div className="picks first">
                  <span className="yn-label">Campaign type</span>
                  <div className="chips">
                    {['Always-on programme', 'Fixed-term campaign', 'Event or launch'].map((o) => (
                      <button key={o} type="button" className={a.campaignType === o ? 'chip on' : 'chip'}
                        onClick={() => set('campaignType')(o)}>{o}</button>
                    ))}
                  </div>
                  <p className="pick-note">
                    Duration is judged against this. A six-week event push and a six-week always-on
                    programme are not the same plan.
                  </p>
                </div>
                {SLIDERS.slice(0, 4).map((s) => (
                  <Slider key={s.key} def={s} value={a[s.key]} zone={zones[s.key]} onChange={set(s.key)} />
                ))}
                <div className="picks">
                  <span className="yn-label">Funnel</span>
                  <div className="chips">
                    {['Full funnel', 'Consideration + conversion', 'Conversion only'].map((o) => (
                      <button key={o} type="button" className={a.stages === o ? 'chip on' : 'chip'}
                        onClick={() => set('stages')(o)}>{o}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head"><span className="grp-letter">B</span>Audience</h2>
              <div className="grp-body">
                <YesNo label="Retargeting layer planned" value={a.retargetingPlanned}
                  onChange={set('retargetingPlanned')} gain={toggleGains.retargetingPlanned} />
                <YesNo label="Exclusions planned" value={a.exclusionsPlanned}
                  onChange={set('exclusionsPlanned')} gain={toggleGains.exclusionsPlanned} />
                <YesNo label="Account list used" value={a.accountList} onChange={set('accountList')}
                  extra="Not available" gain={toggleGains.accountList} />
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head"><span className="grp-letter">C</span>Creative</h2>
              <div className="grp-body">
                {SLIDERS.slice(4, 6).filter((s) => !s.hideWhen?.(a)).map((s) => (
                  <Slider key={s.key} def={s} value={a[s.key]} zone={zones[s.key]} onChange={set(s.key)} />
                ))}
                <div className="picks">
                  <span className="yn-label">Capture</span>
                  <div className="chips">
                    {['Lead Gen Form', 'Landing page', 'Both'].map((o) => (
                      <button key={o} type="button" className={a.capture === o ? 'chip on' : 'chip'}
                        onClick={() => set('capture')(o)}>{o}</button>
                    ))}
                  </div>
                </div>
                <div className="picks">
                  <span className="yn-label">Formats in the mix</span>
                  <div className="chips">
                    {FORMATS.map((f) => (
                      <button key={f} type="button" className={a.formats.includes(f) ? 'chip sm on' : 'chip sm'}
                        onClick={() => toggleFormat(f)}>{f}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head"><span className="grp-letter">D</span>Measurement</h2>
              <div className="grp-body">
                <YesNo label="Tag &amp; conversions ready" value={a.tagPlanned} onChange={set('tagPlanned')} gain={toggleGains.tagPlanned} />
                <YesNo label="Lead routing agreed" value={a.crmPlanned} onChange={set('crmPlanned')} gain={toggleGains.crmPlanned} />
                <YesNo label="Naming convention set" value={a.namingDefined} onChange={set('namingDefined')} gain={toggleGains.namingDefined} />
                <YesNo label="Test plan defined" value={a.testPlan} onChange={set('testPlan')} gain={toggleGains.testPlan} />
                <YesNo label="Delivery schedule agreed" value={a.dayparting} onChange={set('dayparting')} gain={toggleGains.dayparting} />
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head"><span className="grp-letter">E</span>Commercial</h2>
              <div className="grp-body">
                {SLIDERS.slice(6).map((s) => (
                  <Slider key={s.key} def={s} value={a[s.key]} zone={zones[s.key]} onChange={set(s.key)} />
                ))}
                <YesNo label="Creative production budgeted" value={a.creativeBudgeted}
                  onChange={set('creativeBudgeted')} gain={toggleGains.creativeBudgeted} />
                {a.targetLeads > 0 && a.budget > 0 && (
                  <p className="implied">
                    Implies <strong>£{(a.budget / a.targetLeads).toFixed(0)}</strong> per lead
                    {a.dealSize > 0 && (
                      <> · <strong>{(a.dealSize / (a.budget / a.targetLeads)).toFixed(0)}×</strong> deal-to-lead ratio</>
                    )}
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* ---------------- score ---------------- */}
          <div className="panel out">
            <section className="block">
              <div className="block-head">By section</div>
              {SECTIONS.map((s) => {
                const items = res.filter((r) => r.section === s && !r.na);
                if (!items.length) return null;
                const w = items.reduce((n, r) => n + r.weight, 0);
                const e = items.reduce((n, r) => n + r.weight * r.s, 0);
                const p = Math.round((e / w) * 100);
                return (
                  <div className="secrow" key={s}>
                    <div className="secrow-top">
                      <span className="secrow-name">{s}</span>
                      <span className={`secrow-pct${p < 60 ? ' low' : p >= 85 ? ' high' : ''}`}>{p}%</span>
                    </div>
                    <div className="bar">
                      <div className={`bar-fill${p < 60 ? ' low' : p >= 85 ? ' high' : ''}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="block">
              <div className="block-head">
                Gaps
                <span className="range">ordered by score cost</span>
              </div>
              {!deductions.length && <p className="none">Nothing losing marks.</p>}
              {deductions.map((d) => (
                <article className={`ded${d.s === 0 ? ' zero' : ''}`} key={d.id}>
                  <div className="ded-top">
                    <span className="ded-label">{d.label}</span>
                    <span className="ded-lost">−{d.lost.toFixed(0)}</span>
                  </div>
                  <p className="ded-why">{d.why}</p>
                </article>
              ))}
            </section>

            <div className="foot">
              <button type="button" className="btn" onClick={copyReport}>Copy report</button>
              <button type="button" className="btn ghost" onClick={() => setA(BLANK)}>Reset</button>
              <span className="foot-note">
                Bands move as you drag — budget adequacy depends on campaign count, and whether a
                target is realistic depends on budget.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
.masthead,.best{max-width:1180px;margin-left:auto;margin-right:auto;}
.grade{border:2.5px solid var(--ok);color:var(--ok);padding:6px 18px;text-align:center;flex:none;}
.grade.b{border-color:var(--carbon);color:var(--carbon);}
.grade.c{border-color:#B07A1E;color:#B07A1E;}
.grade.d{border-color:var(--stamp);color:var(--stamp);}
.grade-pct{display:block;font-family:'Courier Prime',monospace;font-weight:700;font-size:28px;line-height:1;}
.grade-g{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.17em;text-transform:uppercase;margin-top:3px;}
.best{background:var(--canary);border-left:1px solid var(--ink);border-right:1px solid var(--ink);
  border-bottom:1px solid var(--rule-2);padding:9px 22px;font-size:13px;color:#5C4E1E;
  display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
.best-tag{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.2em;text-transform:uppercase;color:#93803C;flex:none;}
.best-text{flex:1;min-width:180px;}
.best em{font-style:normal;font-family:'Courier Prime',monospace;font-weight:700;
  color:var(--ok);flex:none;}
.cols{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1fr .82fr;align-items:start;}
.grp-body{padding:12px 18px 15px;}
.sl{margin-bottom:14px;}
.sl:last-child{margin-bottom:0;}
.sl-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px;}
.sl-label{font-family:'Archivo Narrow',sans-serif;font-weight:600;font-size:11px;
  letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2);}
.sl-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:15px;color:var(--ink-2);}
.sl-val.good{color:var(--ok);}
.sl-track{position:relative;height:22px;display:flex;align-items:center;}
.sl-track::before{content:'';position:absolute;left:0;right:0;height:6px;background:#E6E4DA;}
.sl-zone{position:absolute;height:6px;background:#C6DCC8;
  border-left:1px solid var(--ok);border-right:1px solid var(--ok);}
.sl-fill{position:absolute;left:0;height:6px;background:var(--carbon);opacity:.5;pointer-events:none;}
.sl-input{position:absolute;left:0;right:0;width:100%;margin:0;background:transparent;
  -webkit-appearance:none;appearance:none;height:22px;cursor:pointer;}
.sl-input::-webkit-slider-runnable-track{height:6px;background:transparent;}
.sl-input::-moz-range-track{height:6px;background:transparent;}
.sl-input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:13px;height:20px;
  background:var(--carbon);border:1px solid #262A55;margin-top:-7px;cursor:grab;}
.sl-input::-moz-range-thumb{width:13px;height:20px;background:var(--carbon);
  border:1px solid #262A55;border-radius:0;cursor:grab;}
.sl-input:active::-webkit-slider-thumb{cursor:grabbing;}
.sl-input:focus{outline:none;}
.sl-input:focus-visible::-webkit-slider-thumb{outline:2px solid var(--carbon);outline-offset:2px;}
.sl-input:focus-visible::-moz-range-thumb{outline:2px solid var(--carbon);outline-offset:2px;}
.sl-learn{position:absolute;left:0;height:6px;pointer-events:none;
  background:repeating-linear-gradient(45deg,#8A8FBF 0 3px,#6E74A8 3px 6px);}
.sl-hint{margin-top:3px;font-size:10.5px;line-height:1.4;min-height:15px;}
.hint-learn{color:var(--ink-2);}
.hint-learn i{font-style:normal;margin:0 5px;opacity:.5;}
.hint-good{color:var(--ok);font-weight:500;}
.hint-move{color:#B07A1E;}
.hint-move em{font-style:normal;font-family:'Courier Prime',monospace;color:var(--ok);
  margin-left:6px;font-weight:700;}
.yn{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:7px 0;border-bottom:1px dotted var(--rule);}
.yn:last-child{border-bottom:none;}
.yn-label{font-family:'Archivo Narrow',sans-serif;font-weight:600;font-size:11px;
  letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2);}
.yn-label em{font-style:normal;font-family:'Courier Prime',monospace;font-size:11px;
  letter-spacing:0;color:var(--ok);margin-left:7px;font-weight:700;}
.tog{display:inline-flex;border:1px solid var(--rule);flex:none;}
.tb{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.1em;text-transform:uppercase;padding:5px 10px;background:none;
  color:var(--ink-2);border:none;cursor:pointer;}
.tb+.tb{border-left:1px solid var(--rule);}
.tb:hover{background:#F1F0EA;}
.tb.on{background:var(--carbon);color:var(--white);}
.tb:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.picks{padding-top:11px;margin-top:10px;border-top:1px dotted var(--rule);}
.picks.first{padding-top:0;margin-top:0;border-top:none;margin-bottom:15px;
  padding-bottom:12px;border-bottom:1px solid var(--rule);}
.pick-note{margin:8px 0 0;font-size:10.5px;line-height:1.5;color:var(--ink-2);}
.chip{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.09em;text-transform:uppercase;padding:6px 10px;background:none;
  border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;}
.chip.sm{padding:4px 8px;font-size:9px;}
.implied{margin:12px 0 0;padding-top:10px;border-top:1px dotted var(--rule);
  font-size:12px;color:var(--ink-2);}
.implied strong{font-family:'Courier Prime',monospace;color:var(--carbon);}
.secrow{margin-bottom:9px;}
.secrow:last-child{margin-bottom:0;}
.secrow-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;}
.secrow-name{font-size:12.5px;color:var(--ink-2);}
.secrow-pct{font-family:'Courier Prime',monospace;font-weight:700;font-size:13px;color:var(--carbon);}
.secrow-pct.low{color:var(--stamp);}
.secrow-pct.high{color:var(--ok);}
.bar{height:6px;background:#EFE5B8;}
.bar-fill{height:100%;background:var(--carbon);transition:width .18s ease-out;}
.bar-fill.low{background:var(--stamp);}
.bar-fill.high{background:var(--ok);}
.ded{padding:9px 0;border-bottom:1px dotted var(--rule-2);}
.ded:last-child{border-bottom:none;}
.ded.zero{background:#F7E9C8;margin:0 -8px;padding-left:8px;padding-right:8px;}
.ded-top{display:flex;align-items:baseline;gap:9px;margin-bottom:3px;}
.ded-label{font-size:12.5px;font-weight:600;flex:1;}
.ded-lost{font-family:'Courier Prime',monospace;font-weight:700;font-size:12px;
  color:var(--stamp);flex:none;}
.ded-why{margin:0;font-size:12px;line-height:1.5;color:#4E4A33;}
.foot{display:flex;align-items:center;gap:9px;padding:13px 16px;flex-wrap:wrap;}
.btn.ghost{background:transparent;color:var(--ink-2);border-color:var(--rule-2);}
.btn.ghost:hover{background:#F3E9B8;color:var(--ink);}
@media (max-width:900px){
  .sheet{padding:10px;}
  .cols{grid-template-columns:1fr;}
  .inputs{border-right:1px solid var(--ink);}
  .out{position:static;max-height:none;border-top:none;}
  .masthead{flex-direction:column;align-items:flex-start;}
  .grade{align-self:flex-end;}
}
@media (prefers-reduced-motion:reduce){.bar-fill{transition:none;}}
`;
