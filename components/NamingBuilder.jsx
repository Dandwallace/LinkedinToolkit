'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

/* ------------------------------------------------------------------ *
 * Token definitions. Order is fixed deliberately — a naming convention
 * whose field order drifts between campaigns is not a convention.
 * ------------------------------------------------------------------ */
const TOKENS = [
  { key: 'client', label: 'Client', from: 'value' },
  { key: 'market', label: 'Market', from: 'value' },
  { key: 'stage', label: 'Stage', from: 'campaign' },
  { key: 'objective', label: 'Objective', from: 'campaign' },
  { key: 'audience', label: 'Audience', from: 'campaign' },
  { key: 'format', label: 'Format', from: 'campaign' },
  { key: 'variant', label: 'Variant', from: 'campaign' },
  { key: 'period', label: 'Period', from: 'value' },
];

/* ------------------------------------------------------------------ *
 * The three rungs of the account.
 *
 * LinkedIn renamed these: the group is now called Campaign and what used
 * to be the campaign is the Ad Set. One flat pattern cannot describe all
 * three, because each rung is distinguished by different tokens. The group
 * is one per objective, so a format token there would be meaningless; the
 * ad is one per creative, so it needs one.
 * ------------------------------------------------------------------ */
const LEVELS = [
  {
    key: 'campaign',
    label: 'Campaign',
    aka: 'the group. LinkedIn used to call this the Campaign Group',
    defaults: { client: true, market: true, stage: true, objective: true, audience: false, format: false, variant: false, period: true },
    note: 'One per objective. Everything below inherits its budget and schedule.',
  },
  {
    key: 'adset',
    label: 'Campaign Ad Set',
    aka: 'what LinkedIn used to call the Campaign, and what actually spends',
    defaults: { client: false, market: true, stage: true, objective: false, audience: true, format: true, variant: false, period: false },
    note: 'One per audience. This is the rung you will filter reporting by.',
  },
  {
    key: 'ad',
    label: 'Ads',
    aka: 'the individual creatives inside an ad set',
    defaults: { client: false, market: false, stage: false, objective: false, audience: false, format: true, variant: true, period: false },
    note: 'One per creative. Keep it short, it sits inside an already long path.',
  },
];

const STAGES = ['Awareness', 'Consideration', 'Conversion'];
const OBJECTIVES = ['Brand', 'Traffic', 'Engagement', 'VideoViews', 'LeadGen', 'Conversions'];
const AUDIENCES = [
  'ICP-Cold',
  'ICP-Warm',
  'Retarget-Site',
  'Retarget-Video',
  'Retarget-Form',
  'ABM-Tier1',
  'ABM-Tier2',
  'Lookalike',
];
const FORMATS = [
  'SingleImage',
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
  { stage: 'Awareness', objective: 'Brand', audience: 'ICP-Cold', format: 'ThoughtLeader', variant: 'v1' },
  { stage: 'Consideration', objective: 'Engagement', audience: 'Retarget-Video', format: 'Document', variant: 'v1' },
  { stage: 'Conversion', objective: 'LeadGen', audience: 'Retarget-Site', format: 'SingleImage', variant: 'v1' },
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

function buildName(tokens, sep, mode, values, row) {
  const parts = TOKENS.filter((t) => tokens[t.key])
    .map((t) => (t.from === 'value' ? values[t.key] : row[t.key]))
    .map(clean)
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
  const [caseMode, setCaseMode] = useState('lower');
  const [values, setValues] = useState({ client: '', market: 'UK', period: 'Q3-2026' });
  const [utm, setUtm] = useState({ source: 'linkedin', medium: 'paid-social', landing: '' });
  const [rows, setRows] = useState(() => STARTER.map((r) => ({ id: nextId(), ...r })));
  const [linked, setLinked] = useState(null);
  const [copied, setCopied] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (r?.value) {
          const b = JSON.parse(r.value);
          const patch = {};
          if (b.client) patch.client = b.client;
          if (b.markets) patch.market = b.markets.split(',')[0].trim();
          if (Object.keys(patch).length) {
            setValues((p) => ({ ...p, ...patch }));
            setLinked(b.client || 'saved brief');
          }
          if (b.website) setUtm((p) => ({ ...p, landing: b.website }));
        }
      } catch {
        /* no brief yet */
      }
      loaded.current = true;
    })();
  }, []);

  const sep = SEPARATORS[sepName];

  const built = useMemo(
    () =>
      rows.map((r) => {
        const names = Object.fromEntries(
          LEVELS.map((l) => [l.key, buildName(levelTokens[l.key], sep, caseMode, values, r)])
        );
        /* The tagged URL keys off the ad set: that is the rung whose name
         * carries the audience, and the one reporting is grouped by. */
        const slug = applyCase(
          TOKENS.filter((t) => levelTokens.adset[t.key])
            .map((t) => (t.from === 'value' ? values[t.key] : r[t.key]))
            .map(clean)
            .filter(Boolean)
            .join('-'),
          'lower'
        );
        return { ...r, names, slug, url: buildUrl(utm.landing, utm, slug, r) };
      }),
    [rows, levelTokens, sep, caseMode, values, utm]
  );

  const patterns = useMemo(
    () =>
      Object.fromEntries(
        LEVELS.map((l) => {
          const parts = TOKENS.filter((t) => levelTokens[l.key][t.key]).map(
            (t) => `{${t.label.toLowerCase()}}`
          );
          return [
            l.key,
            parts.length ? applyCase(parts.join(sep), caseMode) : 'nothing selected',
          ];
        })
      ),
    [levelTokens, sep, caseMode]
  );

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
    for (const l of LEVELS) {
      if (!Object.values(levelTokens[l.key]).some(Boolean)) {
        out.push({
          level: 'blocker',
          text: `${l.label} has no tokens selected, so it generates an empty name.`,
        });
      }
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
  }, [built, levelTokens, values, utm, caseMode]);

  const setRow = (id, patch) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((p) => [
      ...p,
      { id: nextId(), stage: 'Conversion', objective: 'LeadGen', audience: 'ICP-Cold', format: 'SingleImage', variant: 'v1' },
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
        'Campaign\tCampaign Ad Set\tAd\tLanding URL',
        ...built.map((b) => `${b.names.campaign}\t${b.names.adset}\t${b.names.ad}\t${b.url}`),
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
              {linked && ` · prefilled from ${linked}`}
            </div>
          </div>
          <dl className="mast-meta">
            <div>
              <dt>Form</dt>
              <dd>LA-04</dd>
            </div>
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
                  {LEVELS.map((l) => (
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
                {LEVELS.filter((l) => l.key === activeLevel).map((l) => (
                  <div key={l.key}>
                    <p className="lvl-aka">{l.aka}</p>
                    <div className="plate">
                      <span className="plate-lab">{l.label} pattern</span>
                      <code className="plate-code">{patterns[l.key]}</code>
                    </div>
                    <div className="toks">
                      {TOKENS.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          className={levelTokens[l.key][t.key] ? 'tok on' : 'tok'}
                          onClick={() =>
                            setLevelTokens((p) => ({
                              ...p,
                              [l.key]: { ...p[l.key], [t.key]: !p[l.key][t.key] },
                            }))
                          }
                        >
                          <span className="tok-box">{levelTokens[l.key][t.key] ? '×' : ''}</span>
                          {t.label}
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
                <Row label="Client">
                  <input
                    className="inp"
                    value={values.client}
                    placeholder="Acme"
                    onChange={(e) => setValues((p) => ({ ...p, client: e.target.value }))}
                  />
                </Row>
                <Row label="Market">
                  <input
                    className="inp"
                    value={values.market}
                    placeholder="UK"
                    onChange={(e) => setValues((p) => ({ ...p, market: e.target.value }))}
                  />
                </Row>
                <Row label="Period">
                  <input
                    className="inp"
                    value={values.period}
                    placeholder="Q3-2026"
                    onChange={(e) => setValues((p) => ({ ...p, period: e.target.value }))}
                  />
                </Row>
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
                    <Pick value={b.stage} onChange={(v) => setRow(b.id, { stage: v })} options={STAGES} />
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

                  {LEVELS.map((l) => (
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
                Pastes into Sheets as four columns, one per level plus the tagged URL. The same
                names must be used in Campaign Manager or reporting will not join up.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
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
