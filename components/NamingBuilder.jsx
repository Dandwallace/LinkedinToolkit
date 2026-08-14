'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { geoToken, marketsOf, primaryObjective } from '@/lib/brief';

/* ------------------------------------------------------------------ *
 * Token definitions.
 *
 * `from` says where a token's value comes from: `value` is a fixed value
 * typed once (or pulled from the brief), `row` varies per creative, and
 * `period` is rendered from the flight dates.
 * ------------------------------------------------------------------ */
const TOKEN = {
  client: { label: 'Client', from: 'value' },
  stakeholder: { label: 'Stakeholder', from: 'value' },
  campaignName: { label: 'Campaign name', from: 'value' },
  /* The gated asset a Lead Gen Form collects for. Form level only. */
  asset: { label: 'Asset', from: 'value' },
  market: { label: 'Market', from: 'value' },
  objective: { label: 'Objective', from: 'row' },
  audience: { label: 'Audience', from: 'row' },
  format: { label: 'Format', from: 'row' },
  variant: { label: 'Variant', from: 'row' },
  /* Rendered from the date range and never cleaned, so the slashes survive
   * into the name. Its shape differs per level, set in periodFor below. */
  period: { label: 'Period', from: 'period', raw: true },
};

/* ------------------------------------------------------------------ *
 * The rungs of the account, plus the form.
 *
 * LinkedIn renamed the hierarchy: the group is now called Campaign and
 * what used to be the campaign is the Ad Set. One flat pattern cannot
 * describe all of them, because each rung is distinguished by different
 * tokens, in a different order. The group is one per objective, so a
 * format token there would be meaningless; the ad is one per creative, so
 * it needs one.
 *
 * `order` is the token order for that rung and is fixed deliberately: a
 * naming convention whose field order drifts between campaigns is not a
 * convention.
 * ------------------------------------------------------------------ */
const LEVELS = [
  {
    key: 'campaign',
    label: 'Campaign',
    aka: 'the group. LinkedIn used to call this the Campaign Group',
    order: ['client', 'campaignName', 'objective', 'stakeholder', 'period'],
    defaults: {
      client: true,
      campaignName: true,
      objective: true,
      stakeholder: true,
      period: true,
    },
    note: 'Client, campaign, objective, stakeholder, then the flight as MM/YY-MM/YY.',
  },
  {
    key: 'adset',
    label: 'Campaign Ad Set',
    aka: 'what LinkedIn used to call the Campaign, and what actually spends',
    order: ['market', 'audience', 'format', 'period'],
    /* The first slot is market OR audience, whichever this account splits
     * its ad sets by. Both are toggles rather than one fixed choice,
     * because accounts that run one market split by audience and accounts
     * that run one audience split by market. Audience leads by default. */
    defaults: { market: false, audience: true, format: true, period: true },
    note: 'First slot is market or audience, whichever you split by. Then format, then dd/mm-dd/mm.',
  },
  {
    key: 'ad',
    label: 'Ads',
    aka: 'the individual creatives inside an ad set',
    order: ['format', 'variant'],
    defaults: { format: true, variant: true },
    note: 'One per creative. Format and variant only, because it sits inside an already long path.',
  },
  /* Only shown for lead generation campaigns. Forms are account-level
   * assets reused across campaigns, so they sit outside the hierarchy
   * above and need their own convention. Without one the leads list is a
   * column of forms nobody can tell apart. */
  {
    key: 'form',
    label: 'Lead Gen Form',
    aka: 'the form itself, an account-level asset reused across campaigns',
    order: ['client', 'asset', 'period'],
    defaults: { client: true, asset: true, period: true },
    note: 'Client, the gated asset, then the quarter as YYYY-QQ. One per offer, not one per campaign.',
    formOnly: true,
  },
];

/* The form level is for lead generation and nothing else. A document ad
 * on a traffic objective does not get one, so keying off the format would
 * show the level where it does not belong. */
const usesForm = (row) => row.objective === 'LeadGen';

const OBJECTIVES = ['Brand', 'Traffic', 'Engagement', 'VideoViews', 'LeadGen', 'Conversions'];

/* Maps the wording the intake form uses onto the short token used in names. */
const OBJECTIVE_FROM_BRIEF = {
  'Brand awareness': 'Brand',
  'Website traffic': 'Traffic',
  Engagement: 'Engagement',
  'Video views': 'VideoViews',
  'Lead generation': 'LeadGen',
  'Website conversions': 'Conversions',
};

const FORMAT_FROM_BRIEF = {
  'Single image': 'SingleImage',
  Carousel: 'Carousel',
  Video: 'Video',
  Document: 'Document',
  'Thought leader': 'ThoughtLeader',
  'Follower ad': 'FollowerAd',
  Spotlight: 'Spotlight',
  'Text ad': 'TextAd',
  'Message ad': 'Message',
  'Conversation ad': 'Conversation',
  'Event ad': 'Event',
};
const AUDIENCES = [
  'ICP-Cold',
  'ICP-Warm',
  'Retarget-Site',
  'Retarget-Video',
  'Retarget-Form',
  'ABM-Tier1',
  'ABM-Tier2',
  'Lookalike',
  /* The two segments the pharma accounts actually buy against. */
  'Large-Pharma',
  'SMIDs',
];
const FORMATS = [
  'SingleImage',
  'FollowerAd',
  'Carousel',
  'Video',
  'Document',
  'ThoughtLeader',
  'Message',
  'Conversation',
  'Event',
  'Spotlight',
  'TextAd',
];

const SEPARATORS = { Underscore: '_', Hyphen: '-', Pipe: '|' };

let uid = 0;
const nextId = () => `r${++uid}`;

const STARTER = [
  { objective: 'Brand', audience: 'ICP-Cold', format: 'ThoughtLeader', variant: 'v1' },
  { objective: 'Engagement', audience: 'Retarget-Video', format: 'Document', variant: 'v1' },
  { objective: 'LeadGen', audience: 'Retarget-Site', format: 'SingleImage', variant: 'v1' },
];

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/** Strip accents, collapse whitespace and punctuation to nothing usable. */
function clean(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function applyCase(s, mode) {
  if (mode === 'lower') return s.toLowerCase();
  if (mode === 'upper') return s.toUpperCase();
  return s
    .split(/([-_|])/)
    .map((p) => (/[-_|]/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

/**
 * The period token, shaped for the level it sits on.
 *
 * A campaign spans the whole flight, so month and year is the useful
 * granularity. An ad set is often a burst inside that flight, where the day
 * matters and the year is already implied by the campaign above it.
 */
export function periodFor(level, dates) {
  const { start, end } = dates || {};
  if (!start || !end) return '';
  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = end.split('-');
  /* Campaign spans the whole flight, so month and two-digit year. */
  if (level === 'campaign') return `${sm}/${sy.slice(2)}-${em}/${ey.slice(2)}`;
  /* A form outlives any one flight, so it is stamped with the quarter it
   * belongs to rather than a range. */
  if (level === 'form') return `${sy}-Q${Math.floor((Number(sm) - 1) / 3) + 1}`;
  /* An ad set is often a burst inside the flight, where the day matters and
   * the year is already implied by the campaign above it. */
  return `${sd}/${sm}-${ed}/${em}`;
}

/** The value behind one token, before cleaning. */
function tokenValue(key, level, values, row, dates) {
  const t = TOKEN[key];
  if (t.from === 'period') return periodFor(level.key, dates);
  return t.from === 'value' ? values[key] : row[key];
}

function buildName(level, enabled, sep, mode, values, row, dates) {
  const parts = level.order
    .filter((k) => enabled[k])
    .map((k) => {
      const v = tokenValue(k, level, values, row, dates);
      /* The period keeps its slashes; everything else is scrubbed. */
      return TOKEN[k].raw ? String(v || '') : clean(v);
    })
    .filter(Boolean);
  return applyCase(parts.join(sep), mode);
}

/* UTMs are always lowercased regardless of the campaign name casing —
 * GA4 treats utm_source=LinkedIn and utm_source=linkedin as two different
 * sources, which silently splits every report. */
function buildUrl(landing, utm, campaignSlug, row) {
  if (!landing) return '';
  let base;
  try {
    base = new URL(landing.startsWith('http') ? landing : `https://${landing}`);
  } catch {
    return '';
  }
  const params = {
    utm_source: clean(utm.source).toLowerCase(),
    utm_medium: clean(utm.medium).toLowerCase(),
    utm_campaign: campaignSlug.toLowerCase(),
    utm_content: clean(`${row.format}-${row.variant}`).toLowerCase(),
    utm_term: clean(row.audience).toLowerCase(),
  };
  for (const [k, v] of Object.entries(params)) if (v) base.searchParams.set(k, v);
  return base.toString();
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

function Pick({ value, onChange, options, w }) {
  return (
    <select className="inp sel" style={w ? { width: w } : undefined} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */

export default function NamingBuilder() {
  const [levelTokens, setLevelTokens] = useState(() =>
    Object.fromEntries(LEVELS.map((l) => [l.key, { ...l.defaults }]))
  );
  const [activeLevel, setActiveLevel] = useState('campaign');
  const [sepName, setSepName] = useState('Underscore');
  /* Upper by default: it is the house convention. */
  const [caseMode, setCaseMode] = useState('upper');
  const [values, setValues] = useState({
    client: '',
    stakeholder: '',
    campaignName: '',
    asset: '',
    market: 'EMEA',
  });
  const [dates, setDates] = useState({ start: '', end: '' });
  const [utm, setUtm] = useState({ source: 'linkedin', medium: 'paid-social', landing: '' });
  const [rows, setRows] = useState(() => STARTER.map((r) => ({ id: nextId(), ...r })));
  const [linked, setLinked] = useState(null);
  /* Kept so the sheet can say why the geo reads Global. */
  const [briefMarkets, setBriefMarkets] = useState('');
  const [copied, setCopied] = useState('');
  const loaded = useRef(false);

  /* Seeded from the intake brief: client, region, flight dates, the
   * objective, and one row per creative format chosen there, so the naming
   * sheet starts from the plan rather than from the starter rows. */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (!r?.value) return;
        const b = JSON.parse(r.value);

        const patch = {};
        if (b.client) patch.client = b.client;
        if (b.stakeholder) patch.stakeholder = b.stakeholder;
        if (b.campaignName) patch.campaignName = b.campaignName;
        /* One market is that market, several become Global. Naming a
         * three-region campaign after whichever region was typed first is
         * the mistake this replaces. */
        if (b.markets) patch.market = geoToken(b.markets);
        if (Object.keys(patch).length) {
          setValues((p) => ({ ...p, ...patch }));
          setLinked(b.client || 'saved brief');
        }
        if (b.website) setUtm((p) => ({ ...p, landing: b.website }));

        if (b.startDate) {
          const months = Number(b.months) || 0;
          const start = new Date(`${b.startDate}T00:00:00Z`);
          const end = new Date(start);
          if (months) end.setUTCMonth(end.getUTCMonth() + months);
          setDates({
            start: b.startDate,
            end: months ? end.toISOString().slice(0, 10) : '',
          });
        }

        setBriefMarkets(b.markets || '');

        /* The brief stores objectives comma-joined, so the first one is the
         * one to lead the names with. */
        const objective = OBJECTIVE_FROM_BRIEF[primaryObjective(b)];
        /* One row per variant, not one per format: the ad level is named
         * {format}_{variant}, so a format with three variants needs three
         * rows or the sheet cannot produce the names. */
        const picks = [];
        for (const c of b.creatives || []) {
          const format = FORMAT_FROM_BRIEF[c.format];
          if (!format) continue;
          const count = Math.max(1, Number(c.quantity) || 1);
          for (let i = 0; i < count; i++) {
            picks.push({ format, variant: c.variants?.[i] || `V${i + 1}` });
          }
        }

        if (picks.length) {
          setRows(
            picks.map((pick, i) => ({
              id: nextId(),
              objective: objective || 'Brand',
              audience: i === 0 ? 'ICP-Cold' : 'Retarget-Site',
              format: pick.format,
              variant: pick.variant,
            }))
          );
        } else if (objective) {
          setRows((p) => p.map((r) => ({ ...r, objective })));
        }
      } catch {
        /* no brief yet */
      }
      loaded.current = true;
    })();
  }, []);

  const sep = SEPARATORS[sepName];

  /* Whether anything in the sheet needs a form name. A Document ad gated
   * behind a Lead Gen Form is the case, but any lead gen row needs one. */
  const anyForm = useMemo(() => rows.some(usesForm), [rows]);
  const levels = useMemo(() => LEVELS.filter((l) => !l.formOnly || anyForm), [anyForm]);

  /* The form tab disappears when the last lead gen row goes, so the
   * pattern panel cannot be left pointing at a level that is not there. */
  useEffect(() => {
    if (!levels.some((l) => l.key === activeLevel)) setActiveLevel('campaign');
  }, [levels, activeLevel]);

  const built = useMemo(
    () =>
      rows.map((r) => {
        const names = Object.fromEntries(
          LEVELS.map((l) => [l.key, buildName(l, levelTokens[l.key], sep, caseMode, values, r, dates)])
        );
        const adset = LEVELS.find((l) => l.key === 'adset');
        /* The tagged URL keys off the ad set: that is the rung whose name
         * carries the audience, and the one reporting is grouped by. */
        const slug = applyCase(
          adset.order
            .filter((k) => levelTokens.adset[k] && !TOKEN[k].raw)
            .map((k) => clean(tokenValue(k, adset, values, r, dates)))
            .filter(Boolean)
            .join('-'),
          'lower'
        );
        return { ...r, form: usesForm(r), names, slug, url: buildUrl(utm.landing, utm, slug, r) };
      }),
    [rows, levelTokens, sep, caseMode, values, utm, dates]
  );

  const patterns = useMemo(
    () =>
      Object.fromEntries(
        LEVELS.map((l) => {
          const parts = l.order
            .filter((k) => levelTokens[l.key][k])
            .map((k) => {
              if (TOKEN[k].from !== 'period') {
                return `{${TOKEN[k].label.toLowerCase().replace(/\s+/g, '')}}`;
              }
              if (l.key === 'campaign') return 'mm/yy-mm/yy';
              if (l.key === 'form') return 'yyyy-Qq';
              return 'dd/mm-dd/mm';
            });
          return [
            l.key,
            parts.length ? applyCase(parts.join(sep), caseMode) : 'nothing selected',
          ];
        })
      ),
    [levelTokens, sep, caseMode]
  );

  const periodSet = Boolean(dates.start && dates.end);

  const issues = useMemo(() => {
    const out = [];
    /* Duplicates only matter within a rung. Two ad sets under different
     * campaigns may legitimately share a name; two under the same one
     * cannot be told apart in reporting. */
    const seen = new Map();
    for (const b of built) {
      const k = `${b.names.campaign}|${b.names.adset}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    if (dupes.length) {
      out.push({
        level: 'blocker',
        text: `${dupes.length} duplicate ad set name${dupes.length === 1 ? '' : 's'} within the same campaign. Two ad sets sharing a name makes reporting impossible to split. Add the audience or format token, or vary the variant.`,
      });
    }
    for (const l of levels) {
      if (!l.order.some((k) => levelTokens[l.key][k])) {
        out.push({
          level: 'blocker',
          text: `${l.label} has no tokens selected, so it generates an empty name.`,
        });
      }
    }
    if (anyForm && levelTokens.form.asset && !values.asset) {
      out.push({
        level: 'action',
        text: 'The form name carries an asset token but no asset is set. Name the thing being offered, such as the report or the guide, or two forms end up with the same name.',
      });
    }
    if (marketsOf(briefMarkets).length > 1) {
      out.push({
        level: 'note',
        text: `The brief names ${marketsOf(briefMarkets).length} markets, so the geo token is Global rather than any one of them.`,
      });
    }
    if (!values.client) {
      out.push({
        level: 'action',
        text: 'No client name set. Without it, names collide the moment you run a second account.',
      });
    }
    if (!levelTokens.adset.audience) {
      out.push({
        level: 'action',
        text: 'Audience is off at ad set level. It is the field you will most often want to filter reporting by, so it is worth keeping.',
      });
    }
    if (levelTokens.campaign.period && !periodSet) {
      out.push({
        level: 'action',
        text: 'Period is switched on but no flight dates are set, so it drops out of every name. Set the start and end dates.',
      });
    }
    if (!levelTokens.campaign.period) {
      out.push({
        level: 'note',
        text: 'No period token on the campaign. Names will collide across quarters when you re-run the same structure.',
      });
    }
    if (utm.landing && !built.some((b) => b.url)) {
      out.push({
        level: 'blocker',
        text: 'Landing URL could not be parsed. Check it is a valid address.',
      });
    }
    if (!utm.landing) {
      out.push({ level: 'note', text: 'Add a landing URL to generate tagged links.' });
    }
    if (caseMode !== 'lower') {
      out.push({
        level: 'note',
        text: 'UTMs are lowercased automatically regardless of the campaign name casing, because GA4 treats differing cases as separate sources.',
      });
    }
    return out;
  }, [built, levelTokens, values, utm, caseMode, periodSet, levels, anyForm, briefMarkets]);

  const setRow = (id, patch) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((p) => [
      ...p,
      { id: nextId(), objective: 'LeadGen', audience: 'ICP-Cold', format: 'SingleImage', variant: 'v1' },
    ]);
  const delRow = (id) => setRows((p) => p.filter((r) => r.id !== id));

  const copy = (text, tag) => {
    navigator.clipboard?.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(''), 1500);
  };

  const copyTable = () =>
    copy(
      [
        ['Campaign', 'Campaign Ad Set', 'Ad', ...(anyForm ? ['Lead Gen Form'] : []), 'Landing URL']
          .join('\t'),
        ...built.map((b) =>
          [
            b.names.campaign,
            b.names.adset,
            b.names.ad,
            ...(anyForm ? [b.form ? b.names.form : ''] : []),
            b.url,
          ].join('\t')
        ),
      ].join('\n'),
      'table'
    );

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Naming &amp; tracking</h1>
            <div className="linked">
              Campaign, ad set and ad, each with its own pattern
              {anyForm && ', plus the Lead Gen Form'}
              {linked && ` · prefilled from ${linked}`}
            </div>
          </div>
          <dl className="mast-meta">
            <div>
              <dt>Rows</dt>
              <dd>{built.length}</dd>
            </div>
          </dl>
        </header>

        <div className="cols">
          {/* ---------------- pattern ---------------- */}
          <div className="panel inputs">
            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">A</span>
                Patterns
              </h2>
              <div className="grp-body">
                <div className="lvltabs">
                  {levels.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      className={activeLevel === l.key ? 'lvltab on' : 'lvltab'}
                      onClick={() => setActiveLevel(l.key)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                {levels
                  .filter((l) => l.key === activeLevel)
                  .map((l) => (
                    <div key={l.key}>
                      <p className="lvl-aka">{l.aka}</p>
                      <div className="plate">
                        <span className="plate-lab">{l.label} pattern</span>
                        <code className="plate-code">{patterns[l.key]}</code>
                      </div>
                      <div className="toks">
                        {l.order.map((k) => (
                          <button
                            key={k}
                            type="button"
                            className={levelTokens[l.key][k] ? 'tok on' : 'tok'}
                            onClick={() =>
                              setLevelTokens((p) => ({
                                ...p,
                                [l.key]: { ...p[l.key], [k]: !p[l.key][k] },
                              }))
                            }
                          >
                            <span className="tok-box">{levelTokens[l.key][k] ? '×' : ''}</span>
                            {TOKEN[k].label}
                          </button>
                        ))}
                      </div>
                      <p className="lvl-note">{l.note}</p>
                    </div>
                  ))}
                <Row label="Separator">
                  <Pick value={sepName} onChange={setSepName} options={Object.keys(SEPARATORS)} />
                </Row>
                <Row label="Case">
                  <Pick
                    value={caseMode}
                    onChange={setCaseMode}
                    options={['lower', 'upper', 'title']}
                  />
                </Row>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">B</span>
                Fixed values
              </h2>
              <div className="grp-body">
                {/* All four come from the saved brief and stay editable.
                  * Retyping them here is how the same campaign ends up
                  * spelled two ways across the account. */}
                <Row label="Client">
                  <input
                    className="inp"
                    value={values.client}
                    placeholder="Acme"
                    onChange={(e) => setValues((p) => ({ ...p, client: e.target.value }))}
                  />
                </Row>
                <Row label="Stakeholder">
                  <input
                    className="inp"
                    value={values.stakeholder}
                    placeholder="Contact"
                    onChange={(e) => setValues((p) => ({ ...p, stakeholder: e.target.value }))}
                  />
                </Row>
                <Row label="Campaign name">
                  <input
                    className="inp"
                    value={values.campaignName}
                    placeholder="Q3 access"
                    onChange={(e) => setValues((p) => ({ ...p, campaignName: e.target.value }))}
                  />
                </Row>
                <Row
                  label="Market"
                  hint={
                    marketsOf(briefMarkets).length > 1
                      ? `${marketsOf(briefMarkets).length} markets in the brief, so Global`
                      : 'one market, or Global for several'
                  }
                >
                  <input
                    className="inp"
                    value={values.market}
                    placeholder="UK"
                    onChange={(e) => setValues((p) => ({ ...p, market: e.target.value }))}
                  />
                </Row>
                {anyForm && (
                  <Row label="Asset" hint="what the form is collecting for">
                    <input
                      className="inp"
                      value={values.asset}
                      placeholder="Whitepaper"
                      onChange={(e) => setValues((p) => ({ ...p, asset: e.target.value }))}
                    />
                  </Row>
                )}
                <Row label="Flight starts">
                  <input
                    className="inp"
                    type="date"
                    value={dates.start}
                    onChange={(e) => setDates((p) => ({ ...p, start: e.target.value }))}
                  />
                </Row>
                <Row label="Flight ends">
                  <input
                    className="inp"
                    type="date"
                    value={dates.end}
                    onChange={(e) => setDates((p) => ({ ...p, end: e.target.value }))}
                  />
                </Row>
                <p className="fixed-note">
                  Campaigns carry the period as {periodFor('campaign', dates) || 'mm/yy-mm/yy'}, ad
                  sets as {periodFor('adset', dates) || 'dd/mm-dd/mm'}, and Lead Gen Forms as{' '}
                  {periodFor('form', dates) || 'yyyy-Qq'}. The year is implied at ad set level by the
                  campaign above it.
                </p>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">C</span>
                Tracking
              </h2>
              <div className="grp-body">
                <Row label="Landing URL">
                  <input
                    className="inp"
                    value={utm.landing}
                    placeholder="example.com/demo"
                    onChange={(e) => setUtm((p) => ({ ...p, landing: e.target.value }))}
                  />
                </Row>
                <Row label="utm_source">
                  <input
                    className="inp"
                    value={utm.source}
                    onChange={(e) => setUtm((p) => ({ ...p, source: e.target.value }))}
                  />
                </Row>
                <Row label="utm_medium" hint="paid-social or cpc, pick one and never change it">
                  <input
                    className="inp"
                    value={utm.medium}
                    onChange={(e) => setUtm((p) => ({ ...p, medium: e.target.value }))}
                  />
                </Row>
                <p className="fixed-note">
                  utm_campaign, utm_content and utm_term are generated from each row below.
                  LinkedIn has no URL macros, so every link is written out in full.
                </p>
              </div>
            </section>
          </div>

          {/* ---------------- output ---------------- */}
          <div className="panel out">
            {issues.length > 0 && (
              <ul className="issues">
                {issues.map((n, i) => (
                  <li key={i} className={`issue ${n.level}`}>
                    <span className="issue-tag">{n.level}</span>
                    {n.text}
                  </li>
                ))}
              </ul>
            )}

            <div className="rows">
              {built.map((b) => (
                <article className="card" key={b.id}>
                  <div className="card-picks">
                    <Pick
                      value={b.objective}
                      onChange={(v) => setRow(b.id, { objective: v })}
                      options={OBJECTIVES}
                    />
                    <Pick
                      value={b.audience}
                      onChange={(v) => setRow(b.id, { audience: v })}
                      options={AUDIENCES}
                    />
                    <Pick value={b.format} onChange={(v) => setRow(b.id, { format: v })} options={FORMATS} />
                    <input
                      className="inp variant"
                      value={b.variant}
                      onChange={(e) => setRow(b.id, { variant: e.target.value })}
                      aria-label="Variant"
                    />
                    <button
                      type="button"
                      className="card-x"
                      onClick={() => delRow(b.id)}
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </div>

                  {/* The form line only appears on rows that carry a form.
                    * A single image ad pointed at a landing page has no
                    * form to name. */}
                  {LEVELS.filter((l) => !l.formOnly || b.form).map((l) => (
                    <div className={`outline lv-${l.key}`} key={l.key}>
                      <span className="outline-lab">{l.label}</span>
                      <code className="outline-val">{b.names[l.key] || 'no tokens'}</code>
                      <button
                        type="button"
                        className="mini"
                        onClick={() => copy(b.names[l.key], b.id + l.key)}
                      >
                        {copied === b.id + l.key ? '✓' : 'Copy'}
                      </button>
                    </div>
                  ))}

                  {b.url && (
                    <div className="outline url">
                      <span className="outline-lab">Tagged URL</span>
                      <code className="outline-val small">{b.url}</code>
                      <button type="button" className="mini" onClick={() => copy(b.url, b.id + 'u')}>
                        {copied === b.id + 'u' ? '✓' : 'Copy'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="foot">
              <button type="button" className="addbtn" onClick={addRow}>
                + Add row
              </button>
              <button type="button" className="btn" onClick={copyTable}>
                {copied === 'table' ? 'Copied' : 'Copy all as table'}
              </button>
              <span className="foot-note">
                Pastes into Sheets as one column per level plus the tagged URL
                {anyForm ? ', including the Lead Gen Form name' : ''}. The same names must be
                used in Campaign Manager or reporting will not join up.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
.masthead{max-width:1240px;margin:0 auto;}
.cols{max-width:1240px;margin:0 auto;display:grid;grid-template-columns:.76fr 1fr;align-items:start;}
.row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;
  padding:8px 0;border-bottom:1px dotted var(--rule);}
.row-hint{display:block;font-style:normal;font-size:9px;letter-spacing:.04em;
  color:var(--carbon);opacity:.7;margin-top:1px;text-transform:none;}
.inp{font-family:'Courier Prime',monospace;font-size:13.5px;color:var(--carbon);
  background:transparent;border:none;border-bottom:1px solid var(--rule);
  padding:2px 0 3px;border-radius:0;outline:none;width:150px;text-align:right;}
.sel{cursor:pointer;text-align:left;width:auto;}
.lvltabs{display:flex;gap:1px;background:var(--rule);border:1px solid var(--rule);margin:8px 0 0;}
.lvltab{flex:1;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.1em;text-transform:uppercase;padding:7px 6px;background:var(--white);
  color:var(--ink-2);border:none;cursor:pointer;white-space:nowrap;}
.lvltab:hover{background:#F1F0EA;color:var(--ink);}
.lvltab.on{background:var(--carbon);color:var(--white);}
.lvltab:focus-visible{outline:2px solid var(--carbon);outline-offset:-2px;}
.lvl-aka{margin:8px 0 0;font-size:10.5px;line-height:1.45;color:var(--ink-2);}
.lvl-note{margin:0 0 4px;font-size:10.5px;line-height:1.45;color:var(--carbon);}
.outline.lv-campaign .outline-lab{color:var(--carbon);}
.outline.lv-adset{border-top:1px dotted var(--rule-2);}
.outline.lv-ad{border-top:1px dotted var(--rule-2);}
.outline.lv-ad .outline-val{font-size:12px;color:var(--ink-2);}
.outline.lv-form{border-top:1px dotted var(--rule-2);}
.outline.lv-form .outline-lab{color:var(--stamp);}
.plate{background:#EFEEE7;border:1px solid var(--rule);padding:9px 11px;margin:8px 0 10px;}
.plate-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-2);margin-bottom:4px;}
.plate-code{font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--carbon);
  word-break:break-all;line-height:1.45;}
.toks{display:flex;flex-wrap:wrap;gap:4px 13px;padding-bottom:10px;}
.tok{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--ink-2);
  background:none;border:none;padding:2px 0;cursor:pointer;}
.tok-box{width:14px;height:14px;flex:none;border:1px solid var(--rule);background:var(--white);
  font-family:'Courier Prime',monospace;font-size:13px;line-height:12px;color:var(--carbon);
  text-align:center;}
.tok.on{color:var(--ink);}
.tok.on .tok-box{border-color:var(--carbon);}
.tok:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.fixed-note{margin:10px 0 0;font-size:10.5px;line-height:1.5;color:var(--ink-2);}
.rows{padding:4px 0;}
.card{padding:11px 16px 12px;border-bottom:1px solid var(--rule-2);}
.card-picks{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:9px;}
.card-picks .sel{font-size:11.5px;padding:2px 0;border-bottom-color:var(--rule-2);max-width:132px;}
.variant{width:44px;font-size:11.5px;text-align:center;border-bottom-color:var(--rule-2);}
.card-x{margin-left:auto;background:none;border:none;cursor:pointer;color:#B5A87A;
  font-size:17px;line-height:1;padding:0 2px;}
.card-x:hover{color:var(--stamp);}
.card-x:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.outline{display:grid;grid-template-columns:auto 1fr auto;align-items:baseline;gap:9px;
  padding:5px 0;}
.outline.url{border-top:1px dotted var(--rule-2);}
.outline-lab{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.16em;text-transform:uppercase;color:#93803C;white-space:nowrap;}
.outline-val{font-family:'Courier Prime',monospace;font-size:13px;color:var(--carbon);
  word-break:break-all;line-height:1.4;}
.outline-val.small{font-size:11px;color:var(--ink-2);}
.mini{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.12em;text-transform:uppercase;background:none;border:1px solid var(--rule-2);
  color:#93803C;padding:3px 7px;cursor:pointer;white-space:nowrap;}
.mini:hover{background:#F3E9B8;color:var(--ink);}
.foot{display:flex;align-items:center;gap:10px;padding:13px 16px;flex-wrap:wrap;}
.addbtn{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.12em;text-transform:uppercase;background:none;border:1px dashed var(--rule-2);
  color:#93803C;padding:7px 12px;cursor:pointer;}
.addbtn:focus-visible,.btn:focus-visible{outline:2px solid var(--ink);outline-offset:2px;}
.foot-note{font-size:10.5px;line-height:1.4;color:#93803C;flex:1;min-width:200px;}
@media (max-width:900px){
  .sheet{padding:10px;}
  .cols{grid-template-columns:1fr;}
  .inputs{border-right:1px solid var(--ink);}
  .out{position:static;max-height:none;border-top:none;}
  .inp{width:130px;}
}
`;
