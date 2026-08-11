'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { downloadBriefPdf } from '@/lib/brief-pdf';
import { CLIENTS } from '@/lib/client-store';

const CLIENT_NAMES = CLIENTS.map((c) => c.name);

/* ------------------------------------------------------------------ *
 * Benchmark data.
 *
 * These are indicative ranges compiled from published 2025-26 sources.
 * Replace them with your own account data as you accumulate it - that is
 * what will make the forecast actually trustworthy for Whitehart clients.
 * ------------------------------------------------------------------ */
const SECTORS = {
  /* Pharmaceutical leads the list and is the default: it is the whole
   * client base, so anything else is the exception. */
  Pharmaceutical: { cpc: 12.5, cpl: 150, ctr: 0.36 },
  'Professional & corporate services': { cpc: 8.5, cpl: 65, ctr: 0.48 },
  'Technology & software (B2B SaaS)': { cpc: 11.0, cpl: 125, ctr: 0.42 },
  'Financial services & insurance': { cpc: 12.0, cpl: 140, ctr: 0.38 },
  'Healthcare & life sciences': { cpc: 13.0, cpl: 155, ctr: 0.35 },
  'Manufacturing & industrial': { cpc: 7.5, cpl: 85, ctr: 0.52 },
  'Education & training': { cpc: 6.0, cpl: 70, ctr: 0.55 },
  'Recruitment & staffing': { cpc: 7.0, cpl: 75, ctr: 0.5 },
  'Media & communications': { cpc: 6.5, cpl: 80, ctr: 0.58 },
  'Other / not listed': { cpc: 9.0, cpl: 100, ctr: 0.45 },
};

const OBJECTIVES = [
  'Brand awareness',
  'Website traffic',
  'Engagement',
  'Video views',
  'Lead generation',
  'Website conversions',
];

const EMPTY = {
  client: '',
  campaignName: '',
  sector: 'Pharmaceutical',
  website: '',
  markets: '',
  objective: '',
  successLooksLike: '',
  startDate: '',
  months: '',
  budget: '',
  campaignCount: '',
  jobTitles: '',
  jobFunctions: '',
  seniority: '',
  exclusions: '',
  audienceNotes: '',
  targetAccountList: '',
  runningNow: '',
  insightTag: '',
  conversionTracking: '',
  crm: '',
  leadRouting: '',
  landingPages: '',
  assets: [],
  creatives: [],
  constraints: '',
};

/* Formats offered in the brief. The same list the Creative tab builds
 * against, so a brief that names three carousels arrives there as three
 * carousels rather than as a sentence somebody has to retype. */
const CREATIVE_FORMATS = [
  'Single image',
  'Carousel',
  'Video',
  'Document',
  'Thought leader',
  'Follower ad',
  'Spotlight',
  'Text ad',
  'Message ad',
  'Conversation ad',
  'Event ad',
];

/* ------------------------------------------------------------------ *
 * Recommendation engine.
 * Returns entries in priority order: blockers, then actions, then notes.
 * ------------------------------------------------------------------ */
function analyse(b) {
  const out = [];
  const add = (level, title, body) => out.push({ level, title, body });

  const budget = Number(b.budget) || 0;
  const months = Number(b.months) || 0;
  const campaigns = Number(b.campaignCount) || 0;
  const bench = SECTORS[b.sector];

  const monthly = months ? budget / months : 0;
  const daily = monthly ? monthly / 30.4 : 0;
  const dailyPerCampaign = campaigns ? daily / campaigns : daily;

  /* ---------- Blockers: things that break the campaign ---------- */

  if (b.insightTag === 'No') {
    add(
      'blocker',
      'Insight Tag not installed',
      'Without it there is no conversion tracking, no website retargeting and no site-based Matched Audiences. Install site-wide before launch and allow 24 to 48 hours for it to verify.'
    );
  }

  /* Deliberately not gated on the Insight Tag being present. Both can be
   * wrong at once, and when they are, both need saying: fixing the tag
   * alone still leaves nothing counted. */
  if (b.conversionTracking === 'No') {
    add(
      'blocker',
      'No conversion actions defined',
      b.insightTag === 'No'
        ? 'Nothing is being counted, and nothing will be even once the tag is live. Define conversions in Campaign Manager and attach them to campaigns, because conversions only track once linked.'
        : 'The tag is firing but nothing is being counted. Define conversions in Campaign Manager and attach them to campaigns, because conversions only track once linked.'
    );
  }

  if (b.leadRouting === 'No' && b.objective === 'Lead generation') {
    add(
      'blocker',
      'Lead routing not in place',
      'This is the most common silent failure: Lead Gen Form submissions sit inside LinkedIn unread. Wire up CRM sync or a scheduled export, and agree who follows up and how fast.'
    );
  }

  if (daily > 0 && dailyPerCampaign < 10) {
    add(
      'blocker',
      `Daily spend too thin (about $${dailyPerCampaign.toFixed(2)} per campaign)`,
      `$${budget.toLocaleString()} over ${months} month${months === 1 ? '' : 's'} across ${campaigns || 1} campaign${campaigns === 1 ? '' : 's'} sits under LinkedIn's practical $10/day floor. Cut campaign count or raise budget, or delivery will stall.`
    );
  }

  /* ---------- Actions: things to do differently ---------- */

  if (b.targetAccountList === 'Yes') {
    add(
      'action',
      'Build a company Matched Audience',
      'Upload the account list and layer role targeting on top. Company lists match at roughly 70–90%, far above the 30–60% typical of email lists. Include LinkedIn Page URLs to improve the match.'
    );
  }

  if (b.assets.includes('Report, guide or deck')) {
    add(
      'action',
      'Use Document Ads',
      'Document Ads have been running lower cost-per-lead than equivalent single image campaigns, and you get a read-depth metric rather than just clicks. Decide upfront whether to gate it.'
    );
  }

  if (b.assets.includes('Founder or exec on camera')) {
    add(
      'action',
      'Run Thought Leader Ads',
      'A 30–60 second piece to camera from a named person typically clears a fraction of the CPC of polished brand creative. Cheapest credible reach available on the platform right now.'
    );
  }

  if (b.landingPages === 'No' && ['Lead generation', 'Website conversions'].includes(b.objective)) {
    add(
      'action',
      'Default to Lead Gen Forms',
      'Native forms convert at roughly 15–20% against 4–9% for a landing page, because they pre-fill from the profile. Keep to 3–4 fields. Removes the landing page dependency entirely.'
    );
  }

  if (b.runningNow === 'No' && b.objective === 'Lead generation') {
    add(
      'action',
      'Cold audience, conversion objective',
      'Running lead gen straight at people who have never heard of the client is the classic mismatch. Budget a warm-up layer first, then retarget engagers into the form.'
    );
  }

  /* ---------- Notes: worth knowing, not urgent ---------- */

  if (b.markets && /\b(eu|europe|germany|france|spain|italy|netherlands|ireland|poland)\b/i.test(b.markets)) {
    add(
      'note',
      'EU targeting caveats',
      'Sponsored Messaging requires prior opt-in for EU members under the ePrivacy Directive, and Matched Audience sizes run smaller in the EEA because matching depends on member consent.'
    );
  }

  if (budget > 0 && months > 0) {
    add(
      'note',
      'Schedule delivery hours',
      'B2B accounts typically lose 20–35% of spend to weekends and overnight. Agree a dayparting window at setup rather than discovering the waste at month end.'
    );
  }

  if (b.crm && b.crm !== 'None') {
    add(
      'note',
      `Close the loop with ${b.crm}`,
      'Add the LinkedIn click ID as a hidden field on forms so ad engagement ties to CRM records. Gets you most of the attribution value without building a sync engine.'
    );
  }

  const order = { blocker: 0, action: 1, note: 2 };
  return out.sort((a, c) => order[a.level] - order[c.level]);
}

function forecast(b) {
  const bench = SECTORS[b.sector];
  const budget = Number(b.budget) || 0;
  const months = Number(b.months) || 0;
  if (!bench || !budget || !months) return null;

  const monthly = budget / months;
  const clicks = monthly / bench.cpc;
  const impressions = clicks / (bench.ctr / 100);
  const leads = monthly / bench.cpl;

  return {
    monthly,
    daily: monthly / 30.4,
    impressions,
    clicks,
    leads,
    cpl: bench.cpl,
    cpc: bench.cpc,
  };
}

/* ------------------------------------------------------------------ *
 * Field primitives
 * ------------------------------------------------------------------ */

function Field({ label, hint, children }) {
  return (
    <label className="fld">
      <span className="fld-label">
        {label}
        {hint && <em className="fld-hint">{hint}</em>}
      </span>
      {children}
    </label>
  );
}

function Text({ value, onChange, placeholder, type = 'text', prefix }) {
  return (
    <span className={prefix ? 'inp-wrap has-prefix' : 'inp-wrap'}>
      {prefix && <span className="inp-prefix">{prefix}</span>}
      <input
        className="inp"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

function Area({ value, onChange, placeholder, rows = 2 }) {
  return (
    <textarea
      className="inp area"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Choose({ value, onChange, options }) {
  return (
    <select className="inp sel" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose one</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Toggle({ value, onChange, options = ['Yes', 'No'] }) {
  return (
    <span className="tog">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={value === o ? 'tog-btn on' : 'tog-btn'}
          onClick={() => onChange(value === o ? '' : o)}
        >
          {o}
        </button>
      ))}
    </span>
  );
}

function Ticks({ value, onChange, options }) {
  const toggle = (o) =>
    onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  return (
    <span className="ticks">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={value.includes(o) ? 'tick on' : 'tick'}
          onClick={() => toggle(o)}
        >
          <span className="tick-box">{value.includes(o) ? '×' : ''}</span>
          {o}
        </button>
      ))}
    </span>
  );
}

function Section({ letter, title, children }) {
  return (
    <section className="sec">
      <h2 className="sec-head">
        <span className="sec-letter">{letter}</span>
        {title}
      </h2>
      <div className="sec-body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export default function IntakeForm() {
  const [b, setB] = useState(EMPTY);
  const [saved, setSaved] = useState('');
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [airtable, setAirtable] = useState({ state: 'idle', message: '', url: null });
  const [savedBriefs, setSavedBriefs] = useState([]);
  const loaded = useRef(false);

  const set = (k) => (v) => setB((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (r?.value) setB({ ...EMPTY, ...JSON.parse(r.value) });
      } catch {
        /* no saved brief yet - expected on first run */
      }
      try {
        const { keys } = await window.storage.list('brief:client:');
        setSavedBriefs(keys.map((k) => k.replace('brief:client:', '')).sort());
      } catch {
        /* nothing saved by client yet */
      }
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(async () => {
      try {
        await window.storage.set('brief:current', JSON.stringify(b));
        setSaved(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      } catch {
        setSaved('not saved');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [b]);

  const notes = useMemo(() => analyse(b), [b]);
  const fc = useMemo(() => forecast(b), [b]);
  const totalCreatives = b.creatives.reduce((n, c) => n + (Number(c.quantity) || 0), 0);

  /* ---- creative picks ---- */
  const toggleFormat = (format) =>
    setB((p) => ({
      ...p,
      creatives: p.creatives.some((c) => c.format === format)
        ? p.creatives.filter((c) => c.format !== format)
        : [...p.creatives, { format, quantity: 1 }],
    }));

  const bumpFormat = (format, delta) =>
    setB((p) => ({
      ...p,
      creatives: p.creatives.map((c) =>
        c.format === format
          ? { ...c, quantity: Math.min(20, Math.max(1, c.quantity + delta)) }
          : c
      ),
    }));

  /* ---- saving a brief by client ----
   * `brief:current` is the autosave the other tools read. A named save
   * writes a second copy under the client so switching between accounts
   * does not overwrite the one you were last looking at. */
  const refreshSaved = async () => {
    try {
      const { keys } = await window.storage.list('brief:client:');
      setSavedBriefs(keys.map((k) => k.replace('brief:client:', '')).sort());
    } catch {
      setSavedBriefs([]);
    }
  };

  const saveBrief = async () => {
    if (!b.client) return;
    try {
      await window.storage.set(`brief:client:${b.client}`, JSON.stringify(b));
      await refreshSaved();
      setSaved(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setAirtable({ state: 'error', message: `Could not save: ${err.message}`, url: null });
    }
  };

  const loadBrief = async (client) => {
    try {
      const r = await window.storage.get(`brief:client:${client}`);
      setB({ ...EMPTY, ...JSON.parse(r.value) });
      setAirtable({ state: 'done', message: `Loaded the saved brief for ${client}`, url: null });
    } catch {
      setAirtable({ state: 'error', message: `No saved brief for ${client}`, url: null });
    }
  };

  const filled = Object.entries(b).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : String(v).trim() !== ''
  ).length;
  const total = Object.keys(EMPTY).length;

  const copy = () => {
    const lines = [
      `LINKEDIN ADS DISCOVERY BRIEF`,
      `${b.client || 'Unnamed client'} · ${new Date().toLocaleDateString('en-GB')}`,
      '',
      ...Object.entries(b)
        .filter(([, v]) => (Array.isArray(v) ? v.length : String(v).trim()))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`),
      '',
      'FLAGS',
      ...notes.map((n) => `[${n.level.toUpperCase()}] ${n.title}. ${n.body}`),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await downloadBriefPdf(b, notes, fc);
    } catch (err) {
      setAirtable({ state: 'error', message: `Could not build the PDF: ${err.message}`, url: null });
    }
    setExporting(false);
  };

  /* The Airtable token is a write credential for the whole base, so the
   * write happens server-side. The browser only ever sends the brief. */
  const saveToAirtable = async () => {
    setAirtable({ state: 'saving', message: 'Saving…', url: null });
    try {
      const res = await fetch('/api/airtable/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: b,
          flags: notes.map((n) => `[${n.level.toUpperCase()}] ${n.title}. ${n.body}`).join('\n'),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setAirtable({ state: 'error', message: json.error || `Failed (${res.status})`, url: null });
        return;
      }
      setAirtable({ state: 'done', message: 'Saved to Airtable', url: json.url });
    } catch (err) {
      setAirtable({ state: 'error', message: `Could not reach the server: ${err.message}`, url: null });
    }
  };

  const money = (n) => '$' + Math.round(n).toLocaleString('en-GB');

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        {/* ---------------- form header ---------------- */}
        <header className="masthead">
          <div className="mast-left">
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Client discovery brief</h1>
          </div>
          <dl className="mast-meta">
            <div>
              <dt>Form</dt>
              <dd>LA-01</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{new Date().toLocaleDateString('en-GB')}</dd>
            </div>
            <div>
              <dt>Complete</dt>
              <dd>
                {filled}/{total}
              </dd>
            </div>
          </dl>
        </header>

        <div className="cols">
          {/* ---------------- top copy: the form ---------------- */}
          <div className="copy top-copy">
            <Section letter="A" title="Client & market">
              <Field label="Client">
                <Choose value={b.client} onChange={set('client')} options={CLIENT_NAMES} />
              </Field>
              <Field label="Campaign name" hint="carries through to creative">
                <Text
                  value={b.campaignName}
                  onChange={set('campaignName')}
                  placeholder="Q3 patient access push"
                />
              </Field>
              <Field label="Sector" hint="drives benchmarks">
                <Choose value={b.sector} onChange={set('sector')} options={Object.keys(SECTORS)} />
              </Field>
              <Field label="Website / landing page">
                <Text value={b.website} onChange={set('website')} placeholder="example.com" />
              </Field>
              <Field label="Markets">
                <Text value={b.markets} onChange={set('markets')} placeholder="UK, Ireland, DACH" />
              </Field>
            </Section>

            <Section letter="B" title="Objective & targets">
              <Field label="Campaign objective">
                <Choose value={b.objective} onChange={set('objective')} options={OBJECTIVES} />
              </Field>
              <Field label="Success looks like" hint="their words">
                <Area
                  value={b.successLooksLike}
                  onChange={set('successLooksLike')}
                  placeholder="What do they say a good outcome is?"
                />
              </Field>
            </Section>

            <Section letter="C" title="Budget & duration">
              <Field label="Total budget">
                <Text value={b.budget} onChange={set('budget')} type="number" prefix="$" placeholder="0" />
              </Field>
              <Field label="Duration" hint="months">
                <Text value={b.months} onChange={set('months')} type="number" placeholder="0" />
              </Field>
              <Field label="Start date">
                <Text value={b.startDate} onChange={set('startDate')} type="date" />
              </Field>
              <Field label="Planned campaigns">
                <Text
                  value={b.campaignCount}
                  onChange={set('campaignCount')}
                  type="number"
                  placeholder="0"
                />
              </Field>
            </Section>

            <Section letter="D" title="Audience">
              <Field label="Job titles">
                <Text
                  value={b.jobTitles}
                  onChange={set('jobTitles')}
                  placeholder="Medical Affairs Lead, Market Access Manager"
                />
              </Field>
              <Field label="Job functions">
                <Text
                  value={b.jobFunctions}
                  onChange={set('jobFunctions')}
                  placeholder="Healthcare Services, Research"
                />
              </Field>
              <Field label="Seniority">
                <Text
                  value={b.seniority}
                  onChange={set('seniority')}
                  placeholder="Manager and above"
                />
              </Field>
              <Field label="Exclusions">
                <Text
                  value={b.exclusions}
                  onChange={set('exclusions')}
                  placeholder="Competitors, own staff, existing customers"
                />
              </Field>
              <Field label="How to split the audience" hint="their words, not a structure">
                <Area
                  value={b.audienceNotes}
                  onChange={set('audienceNotes')}
                  rows={4}
                  placeholder="What was actually said about who to reach and how to separate them. The exact split is rarely known at brief stage, so capture the intent rather than inventing segments."
                />
              </Field>
              <Field label="Target account list available">
                <Toggle value={b.targetAccountList} onChange={set('targetAccountList')} />
              </Field>
            </Section>

            <Section letter="E" title="Tracking & systems">
              <Field label="Running LinkedIn ads now">
                <Toggle value={b.runningNow} onChange={set('runningNow')} />
              </Field>
              <Field label="Insight Tag installed">
                <Toggle value={b.insightTag} onChange={set('insightTag')} />
              </Field>
              <Field label="Conversion tracking live">
                <Toggle value={b.conversionTracking} onChange={set('conversionTracking')} />
              </Field>
              <Field label="CRM">
                <Choose
                  value={b.crm}
                  onChange={set('crm')}
                  options={['HubSpot', 'Salesforce', 'Pipedrive', 'Dynamics', 'Other', 'None']}
                />
              </Field>
              <Field label="Lead routing agreed" hint="who follows up, how fast">
                <Toggle value={b.leadRouting} onChange={set('leadRouting')} />
              </Field>
            </Section>

            <Section letter="F" title="Assets & constraints">
              <Field label="Landing pages ready">
                <Toggle value={b.landingPages} onChange={set('landingPages')} />
              </Field>
              <Field label="Assets available">
                <Ticks
                  value={b.assets}
                  onChange={set('assets')}
                  options={[
                    'Report, guide or deck',
                    'Founder or exec on camera',
                    'Case studies',
                    'Product video',
                    'Brand imagery',
                    'Webinar or event',
                  ]}
                />
              </Field>
              <Field label="Constraints" hint="legal, brand, approvals">
                <Area
                  value={b.constraints}
                  onChange={set('constraints')}
                  placeholder="Anything that slows sign-off or limits messaging"
                />
              </Field>
            </Section>

            <Section letter="G" title="Creative to produce">
              <div className="fld stack-fld">
                <span className="fld-label">
                  Formats
                  <em className="fld-hint">carries into the Creative tab</em>
                </span>
                <div className="cfmt">
                  {CREATIVE_FORMATS.map((f) => {
                    const picked = b.creatives.find((c) => c.format === f);
                    return (
                      <div className={picked ? 'cfmt-row on' : 'cfmt-row'} key={f}>
                        <button
                          type="button"
                          className="cfmt-name"
                          onClick={() => toggleFormat(f)}
                          aria-pressed={Boolean(picked)}
                        >
                          <span className="cfmt-box">{picked ? '×' : ''}</span>
                          {f}
                        </button>
                        {picked && (
                          <span className="cfmt-step">
                            <button
                              type="button"
                              className="cfmt-b"
                              onClick={() => bumpFormat(f, -1)}
                              disabled={picked.quantity <= 1}
                              aria-label={`One fewer ${f}`}
                            >
                              −
                            </button>
                            <span className="cfmt-n">{picked.quantity}</span>
                            <button
                              type="button"
                              className="cfmt-b"
                              onClick={() => bumpFormat(f, 1)}
                              disabled={picked.quantity >= 20}
                              aria-label={`One more ${f}`}
                            >
                              +
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {totalCreatives > 0 && (
                <p className="cfmt-total">
                  {totalCreatives} asset{totalCreatives === 1 ? '' : 's'} across{' '}
                  {b.creatives.length} format{b.creatives.length === 1 ? '' : 's'}. Open the
                  Creative tab to write the copy.
                </p>
              )}
            </Section>

            <footer className="foot">
              <div className="foot-btns">
                <button type="button" className="btn" onClick={exportPdf} disabled={exporting}>
                  {exporting ? 'Building…' : 'Download PDF'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={saveToAirtable}
                  disabled={airtable.state === 'saving'}
                >
                  {airtable.state === 'saving' ? 'Saving…' : 'Save to Airtable'}
                </button>
                <button type="button" className="btn" onClick={saveBrief} disabled={!b.client}>
                  Save
                </button>
                <button type="button" className="btn ghost" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (confirm('Clear this brief and start a new one?')) setB(EMPTY);
                  }}
                >
                  New brief
                </button>
              </div>
              <div className="foot-meta">
                <span className="save">{saved ? `Autosaved ${saved}` : 'Autosaving'}</span>
                {savedBriefs.length > 0 && (
                  <label className="loadwrap">
                    <span className="load-lab">Load saved</span>
                    <select
                      className="load-sel"
                      value=""
                      onChange={(e) => e.target.value && loadBrief(e.target.value)}
                    >
                      <option value="">Choose a client</option>
                      {savedBriefs.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </footer>

            {airtable.state !== 'idle' && airtable.state !== 'saving' && (
              <p className={`airtable-msg${airtable.state === 'error' ? ' bad' : ''}`}>
                {airtable.message}
                {airtable.url && (
                  <>
                    {'. '}
                    <a href={airtable.url} target="_blank" rel="noreferrer">
                      open the record
                    </a>
                  </>
                )}
              </p>
            )}
          </div>

          {/* ---------------- carbon copy: what it implies ---------------- */}
          <aside className="copy carbon">
            <div className="carbon-head">
              <span className="carbon-eyebrow">Duplicate, office copy</span>
              <h2 className="carbon-title">What this implies</h2>
            </div>

            {fc && (
              <div className="fcast">
                <div className="fcast-head">Forecast at sector benchmark</div>
                <table className="fcast-tbl">
                  <tbody>
                    <tr>
                      <th>Monthly budget</th>
                      <td>{money(fc.monthly)}</td>
                    </tr>
                    <tr>
                      <th>Daily</th>
                      <td>{money(fc.daily)}</td>
                    </tr>
                    <tr>
                      <th>Impressions</th>
                      <td>{Math.round(fc.impressions).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <th>Clicks</th>
                      <td>
                        {Math.round(fc.clicks).toLocaleString()}{' '}
                        <em>@ {money(fc.cpc)}</em>
                      </td>
                    </tr>
                    <tr className="hi">
                      <th>Leads / month</th>
                      <td>
                        {Math.floor(fc.leads).toLocaleString()} <em>@ {money(fc.cpl)}</em>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="fcast-note">
                  Indicative sector benchmarks, not a promise. Replace with real account data as
                  you gather it.
                </p>
              </div>
            )}

            {notes.length === 0 && !fc && (
              <p className="empty">
                Start filling the form. Flags, gaps and a forecast print here as you go.
              </p>
            )}

            <ul className="notes">
              {notes.map((n, i) => (
                <li key={n.title} className={`note ${n.level}`} style={{ '--i': i }}>
                  <span className="note-tag">{n.level}</span>
                  <h3 className="note-title">{n.title}</h3>
                  <p className="note-body">{n.body}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Styles — multipart carbon form.
 * Top copy is white stock with printed labels and typed answers.
 * Right column is the canary duplicate.
 * ------------------------------------------------------------------ */
const CSS = `
.sheet {
  --white:    #FCFCFA;
  --canary:   #FAF3D2;
  --canary-2: #F3E9B8;
  --ink:      #1B1D19;
  --ink-2:    #5C5F57;
  --carbon:   #3A3F7A;
  --rule:     #D6D4C8;
  --rule-2:   #DCCF8E;
  --stamp:    #A8342A;
  --ok:       #2F6B4F;

  font-family: 'Archivo', system-ui, sans-serif;
  color: var(--ink);
  background: #E8E6DD;
  min-height: 100vh;
  padding: 20px;
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}
.sheet *, .sheet *::before, .sheet *::after { box-sizing: border-box; }
/* ---- masthead ---- */
.masthead {
  max-width: 1240px; margin: 0 auto;
  background: var(--white);
  border: 1px solid var(--ink);
  border-bottom: none;
  padding: 18px 22px 14px;
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 24px; flex-wrap: wrap;
}
.mast-eyebrow {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase;
  color: var(--carbon); margin-bottom: 5px;
}
.mast-title {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: clamp(22px, 3.4vw, 32px); line-height: 1;
  margin: 0; letter-spacing: -.01em; text-transform: uppercase;
}
.mast-meta { display: flex; gap: 26px; margin: 0; }
.mast-meta div { text-align: right; }
.mast-meta dt {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 9px; letter-spacing: .16em; text-transform: uppercase;
  color: var(--ink-2); margin-bottom: 2px;
}
.mast-meta dd {
  font-family: 'Courier Prime', monospace; font-size: 14px;
  margin: 0; color: var(--ink);
}
/* ---- two-column sheet ---- */
.cols {
  max-width: 1240px; margin: 0 auto;
  display: grid; grid-template-columns: 1.32fr 1fr;
  align-items: start;
}
.copy { border: 1px solid var(--ink); }
.top-copy { background: var(--white); border-right: none; }
.carbon {
  background: var(--canary);
  position: sticky; top: 20px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}
/* ---- form sections ---- */
.sec { border-bottom: 1px solid var(--rule); }
.sec:last-of-type { border-bottom: none; }
.sec-head {
  display: flex; align-items: center; gap: 10px;
  margin: 0; padding: 11px 22px 9px;
  background: #F3F2EC; border-bottom: 1px solid var(--rule);
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 12px; letter-spacing: .15em; text-transform: uppercase;
}
.sec-letter {
  width: 19px; height: 19px; flex: none;
  display: grid; place-items: center;
  background: var(--carbon); color: var(--white);
  font-size: 11px; letter-spacing: 0;
}
.sec-body { padding: 4px 22px 16px; }
/* ---- fields ---- */
.fld {
  display: grid; grid-template-columns: 190px 1fr;
  align-items: baseline; gap: 14px;
  padding: 9px 0 8px;
  border-bottom: 1px dotted var(--rule);
}
.fld:last-child { border-bottom: none; }
.fld-label {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 600;
  font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink-2); padding-top: 3px;
}
.fld-hint {
  display: block; font-style: normal; font-weight: 600;
  font-size: 9.5px; letter-spacing: .08em; color: var(--carbon);
  opacity: .75; margin-top: 1px;
}
.inp-wrap { display: block; position: relative; }
.inp-wrap.has-prefix .inp { padding-left: 17px; }
.inp-prefix {
  position: absolute; left: 0; top: 3px;
  font-family: 'Courier Prime', monospace; font-size: 14.5px; color: var(--ink-2);
}
.inp {
  width: 100%; display: block;
  font-family: 'Courier Prime', monospace; font-size: 14.5px; color: var(--carbon);
  background: transparent; border: none; border-bottom: 1px solid var(--rule);
  padding: 2px 0 4px; border-radius: 0; outline: none;
}
.inp::placeholder { color: #B6B4A9; font-size: 13px; }
.inp:focus { border-bottom-color: var(--carbon); background: #F6F5FB; }
.inp:focus-visible { outline: 2px solid var(--carbon); outline-offset: 2px; }
.area { resize: vertical; line-height: 1.5; min-height: 44px; }
.sel { cursor: pointer; }
/* ---- toggles ---- */
.tog { display: inline-flex; border: 1px solid var(--rule); }
.tog-btn {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  padding: 5px 15px; background: transparent; color: var(--ink-2);
  border: none; cursor: pointer; transition: background .12s, color .12s;
}
.tog-btn + .tog-btn { border-left: 1px solid var(--rule); }
.tog-btn:hover { background: #F1F0EA; }
.tog-btn.on { background: var(--carbon); color: var(--white); }
.tog-btn:focus-visible { outline: 2px solid var(--carbon); outline-offset: 2px; }
/* ---- tick list ---- */
.ticks { display: flex; flex-wrap: wrap; gap: 5px 16px; }
.tick {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'Archivo', sans-serif; font-size: 12.5px; color: var(--ink-2);
  background: none; border: none; padding: 2px 0; cursor: pointer;
}
.tick-box {
  width: 14px; height: 14px; flex: none;
  border: 1px solid var(--rule); background: var(--white);
  font-family: 'Courier Prime', monospace; font-size: 13px; line-height: 12px;
  color: var(--carbon); text-align: center;
}
.tick.on { color: var(--ink); }
.tick.on .tick-box { border-color: var(--carbon); }
.tick:focus-visible { outline: 2px solid var(--carbon); outline-offset: 2px; }
/* ---- footer ---- */
.foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  padding: 14px 22px; border-top: 1px solid var(--ink);
  background: #F3F2EC;
}
/* One row, one height. The buttons previously mixed padding and inherited
 * line-heights, so they sat at three different heights on one line. */
.foot-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.foot-btns .btn {
  height: 34px; padding: 0 16px; margin: 0;
  display: inline-flex; align-items: center; justify-content: center;
  line-height: 1; white-space: nowrap;
}
.foot-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.loadwrap { display: inline-flex; align-items: center; gap: 6px; }
.load-lab {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700; font-size: 9px;
  letter-spacing: .16em; text-transform: uppercase; color: var(--ink-2);
}
.load-sel {
  font-family: 'Courier Prime', monospace; font-size: 12px; color: var(--carbon);
  background: var(--white); border: 1px solid var(--rule); padding: 5px 7px;
  border-radius: 0; height: 30px;
}
.load-sel:focus-visible { outline: 2px solid var(--carbon); outline-offset: 1px; }
.btn:disabled { opacity: .45; cursor: default; }
/* ---- creative picks ---- */
.stack-fld { display: block; }
.stack-fld .fld-label { display: block; margin-bottom: 7px; }
.cfmt { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 3px 14px; }
.cfmt-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.cfmt-name {
  flex: 1; display: inline-flex; align-items: center; gap: 7px; min-width: 0;
  font-family: 'Archivo', sans-serif; font-size: 12.5px; color: var(--ink-2);
  background: none; border: none; padding: 2px 0; cursor: pointer; text-align: left;
}
.cfmt-row.on .cfmt-name { color: var(--ink); }
.cfmt-box {
  width: 14px; height: 14px; flex: none;
  border: 1px solid var(--rule); background: var(--white);
  font-family: 'Courier Prime', monospace; font-size: 13px; line-height: 12px;
  color: var(--carbon); text-align: center;
}
.cfmt-row.on .cfmt-box { border-color: var(--carbon); }
.cfmt-name:focus-visible { outline: 2px solid var(--carbon); outline-offset: 2px; }
.cfmt-step { display: inline-flex; align-items: center; border: 1px solid var(--rule); flex: none; }
.cfmt-b {
  width: 20px; height: 20px; background: none; border: none; cursor: pointer;
  font-family: 'Courier Prime', monospace; font-size: 14px; line-height: 1;
  color: var(--carbon); padding: 0;
}
.cfmt-b:disabled { opacity: .3; cursor: default; }
.cfmt-b:focus-visible { outline: 2px solid var(--carbon); outline-offset: -2px; }
.cfmt-n {
  min-width: 20px; text-align: center; font-family: 'Courier Prime', monospace;
  font-size: 12px; font-weight: 700;
  border-left: 1px solid var(--rule); border-right: 1px solid var(--rule); padding: 1px 0;
}
.cfmt-total { margin: 10px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--carbon); }
.airtable-msg {
  margin: 0; padding: 10px 22px 13px; background: #F3F2EC;
  border-top: 1px dotted var(--rule);
  font-size: 12px; line-height: 1.5; color: var(--ok);
}
.airtable-msg.bad { color: var(--stamp); }
.airtable-msg a { color: var(--carbon); }
.btn {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 11px; letter-spacing: .13em; text-transform: uppercase;
  padding: 8px 18px; cursor: pointer;
  background: var(--carbon); color: var(--white); border: 1px solid var(--carbon);
}
.btn:hover { background: #2E3266; }
.btn.ghost { background: transparent; color: var(--ink-2); border-color: var(--rule); }
.btn.ghost:hover { background: var(--white); color: var(--ink); }
.btn:focus-visible { outline: 2px solid var(--carbon); outline-offset: 2px; }
.save {
  margin-left: auto;
  font-family: 'Courier Prime', monospace; font-size: 11.5px; color: var(--ink-2);
}
/* ---- carbon copy ---- */
/* Matches the form's own section header height so the two columns start on
 * the same line. It used to sit 7px lower, which read as a misalignment. */
.carbon-head { padding: 11px 20px 10px; border-bottom: 1px solid var(--rule-2); }
.carbon-eyebrow {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 9.5px; letter-spacing: .2em; text-transform: uppercase;
  color: #93803C; display: block; margin-bottom: 4px;
}
.carbon-title {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 19px; letter-spacing: -.005em; text-transform: uppercase; margin: 0;
}
.empty {
  padding: 22px 20px; margin: 0;
  font-size: 13px; line-height: 1.55; color: #8C7C43;
}
/* ---- forecast block ---- */
.fcast { padding: 14px 20px 16px; border-bottom: 1px solid var(--rule-2); }
.fcast-head {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
  color: #93803C; margin-bottom: 8px;
}
.fcast-tbl { width: 100%; border-collapse: collapse; }
.fcast-tbl th {
  text-align: left; font-family: 'Archivo', sans-serif; font-weight: 500;
  font-size: 12.5px; color: var(--ink-2); padding: 4px 0;
  border-bottom: 1px dotted var(--rule-2);
}
.fcast-tbl td {
  text-align: right; font-family: 'Courier Prime', monospace; font-size: 14px;
  color: var(--ink); padding: 4px 0; border-bottom: 1px dotted var(--rule-2);
}
.fcast-tbl td em {
  font-style: normal; font-size: 11.5px; color: var(--ink-2);
}
.fcast-tbl tr.hi th { font-weight: 600; color: var(--ink); }
.fcast-tbl tr.hi td { color: var(--carbon); font-weight: 700; }
.fcast-note {
  margin: 9px 0 0; font-size: 10.5px; line-height: 1.45; color: #93803C;
}
/* ---- flags ---- */
.notes { list-style: none; margin: 0; padding: 0; }
.note {
  padding: 13px 20px 14px 18px;
  border-bottom: 1px solid var(--rule-2);
  border-left: 3px solid var(--carbon);
  animation: print .22s ease-out both;
  animation-delay: calc(var(--i) * 25ms);
}
.note.blocker { border-left-color: var(--stamp); background: #F7E9C8; }
.note.note { border-left-color: var(--rule-2); }
.note-tag {
  font-family: 'Archivo Narrow', sans-serif; font-weight: 700;
  font-size: 9px; letter-spacing: .2em; text-transform: uppercase;
  color: var(--carbon); display: block; margin-bottom: 3px;
}
.note.blocker .note-tag { color: var(--stamp); }
.note.note .note-tag { color: #93803C; }
.note-title {
  font-family: 'Archivo', sans-serif; font-weight: 600;
  font-size: 13.5px; line-height: 1.3; margin: 0 0 4px;
}
.note-body {
  margin: 0; font-size: 12.5px; line-height: 1.5; color: #4E4A33;
}
@keyframes print {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: none; }
}
@media (max-width: 900px) {
  .sheet { padding: 10px; }
  .cols { grid-template-columns: 1fr; }
  .top-copy { border-right: 1px solid var(--ink); border-bottom: none; }
  .carbon { position: static; max-height: none; border-top: none; }
  .fld { grid-template-columns: 1fr; gap: 3px; }
  .mast-meta { gap: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .note { animation: none; }
  .sheet * { transition: none !important; }
}
`;
