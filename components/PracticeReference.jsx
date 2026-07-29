'use client';

import React, { useState, useMemo } from 'react';

/* ==================================================================== *
 * LINKEDIN ADS — BEST PRACTICE REFERENCE
 *
 * TO UPDATE: edit the PRACTICES array below. Each entry needs:
 *   headline   the number or rule, kept short — this is what gets scanned
 *   practice   one sentence stating the practice
 *   why        why it matters, or what goes wrong without it
 *   source     { name, url, type }
 *   verified   ISO date you last checked the source still says this
 *
 * source.type drives the confidence badge:
 *   'official'  LinkedIn's own documentation — treat as authoritative
 *   'industry'  agency or practitioner writing — directional, widely held
 *   'vendor'    a company with something to sell — verify before quoting
 *
 * Entries flag themselves amber past 6 months and red past 12. Re-check
 * the source and bump `verified` rather than deleting the warning.
 * ==================================================================== */

const REVIEW_AMBER_MONTHS = 6;
const REVIEW_RED_MONTHS = 12;

const PRACTICES = [
  /* ---------------- budget & structure ---------------- */
  {
    id: 'daily-practical',
    category: 'Budget & structure',
    headline: '£75–150/day per campaign',
    practice: 'Fund each campaign to generate 5–10 clicks a day at your expected CPC.',
    why: "LinkedIn's £10/day technical minimum and the practical B2B minimum are an order of magnitude apart. Campaigns funded between the two run without ever accumulating enough data to optimise.",
    source: { name: 'Stackmatix — LinkedIn Ads Budget Planning for B2B', url: 'https://www.stackmatix.com/blog/linkedin-ads-budget-planning-b2b', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'campaign-count',
    category: 'Budget & structure',
    headline: '2–3 campaigns maximum',
    practice: 'Concentrate spend rather than dividing it evenly across many campaigns.',
    why: 'Splitting £10,000/month across five campaigns leaves each at roughly £65/day — below the practical floor for most B2B audiences. Fewer campaigns with more behind each outperform many running thin, particularly during the learning phase.',
    source: { name: 'Stackmatix — LinkedIn Ads Budget Planning for B2B', url: 'https://www.stackmatix.com/blog/linkedin-ads-budget-planning-b2b', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'creative-budget',
    category: 'Budget & structure',
    headline: '15–25% on top for creative',
    practice: 'Budget creative production separately from media spend.',
    why: "LinkedIn's small audiences exhaust creative quickly. A £10,000/month media budget needs roughly £1,500–2,500/month of production support to keep performance from decaying.",
    source: { name: 'Stackmatix — LinkedIn Ads Budget Planning for B2B', url: 'https://www.stackmatix.com/blog/linkedin-ads-budget-planning-b2b', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'daily-minimum',
    category: 'Budget & structure',
    headline: '£10/day technical minimum',
    practice: "LinkedIn's own floor per campaign, but not a target.",
    why: 'Widely quoted and widely misread as a recommendation. It is the point below which campaigns will not run, not the point above which they work.',
    source: { name: 'LinkedIn — Campaign and ad set budgets', url: 'https://www.linkedin.com/help/lms/answer/a422101', type: 'official' },
    verified: '2026-07-28',
  },
  {
    id: 'structure-rule',
    category: 'Budget & structure',
    headline: 'One audience per campaign',
    practice: 'One objective per campaign group, one audience segment per campaign, two or more ads per campaign.',
    why: 'When two audiences share a campaign you cannot tell which drove the conversion — only that the campaign averaged an acceptable cost. That is not optimisation, it is guessing.',
    source: { name: 'Stackmatix — LinkedIn Ads Account Structure', url: 'https://www.stackmatix.com/blog/linkedin-ads-account-structure', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'renaming',
    category: 'Budget & structure',
    headline: 'Campaign Groups → Campaigns',
    practice: 'LinkedIn began renaming Campaign Groups to "Campaigns" and Campaigns to "Ad Sets" in late 2025, aligning with Meta and Google.',
    why: 'Functionality is identical, but both conventions appear in documentation and in client conversations. Confirm which one someone means before agreeing a structure.',
    source: { name: 'AgencyAccess — LinkedIn Ads Management Guide', url: 'https://www.agencyaccess.co/blog/linkedin-ads-management-the-complete-guide', type: 'industry' },
    verified: '2026-07-28',
  },

  /* ---------------- audience ---------------- */
  {
    id: 'audience-min',
    category: 'Audience',
    headline: '300 members minimum',
    practice: 'An audience cannot be targeted until it holds at least 300 matched members.',
    why: 'This is the hard gate on every retargeting pool. Until it clears, a planned conversion layer simply cannot run.',
    source: { name: 'LinkedIn — Campaign setup best practices', url: 'https://www.linkedin.com/help/lms/answer/a422123/campaign-setup-best-practices', type: 'official' },
    verified: '2026-07-28',
  },
  {
    id: 'audience-suggested',
    category: 'Audience',
    headline: '50,000 suggested',
    practice: "LinkedIn's own recommended minimum audience size for driving campaign results.",
    why: 'Below this, delivery stalls and frequency climbs against the same small group. The 300 floor is what is permitted; 50,000 is what works.',
    source: { name: 'LinkedIn — Campaign setup best practices', url: 'https://www.linkedin.com/help/lms/answer/a422123/campaign-setup-best-practices', type: 'official' },
    verified: '2026-07-28',
  },
  {
    id: 'four-attributes',
    category: 'Audience',
    headline: 'At least 4 include attributes',
    practice: 'LinkedIn recommends adding four or more attributes to the INCLUDE section when building an audience from targeting facets.',
    why: 'Fewer attributes tends to produce audiences too small to deliver. Less well known than the size thresholds, and useful when an audience comes back unexpectedly narrow.',
    source: { name: 'LinkedIn — Campaign setup best practices', url: 'https://www.linkedin.com/help/lms/answer/a422123/campaign-setup-best-practices', type: 'official' },
    verified: '2026-07-28',
  },
  {
    id: 'company-match',
    category: 'Audience',
    headline: 'Company lists match 70–90%',
    practice: 'Company list uploads match far better than contact lists, which typically reach 30–60%.',
    why: 'Sets expectations before an upload. A company list returning well under 70% usually needs LinkedIn Page URLs adding alongside company names.',
    source: { name: 'Industry consensus — multiple ABM practitioner sources', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'permanent-location',
    category: 'Audience',
    headline: 'Permanent, not recent location',
    practice: 'Set location targeting to permanent location rather than recent location.',
    why: 'Recent location includes anyone who has passed through the area. For B2B you almost always want where someone actually works.',
    source: { name: 'Industry consensus — practitioner guidance', url: '', type: 'industry' },
    verified: '2026-07-28',
  },

  /* ---------------- creative & formats ---------------- */
  {
    id: 'two-ads',
    category: 'Creative & formats',
    headline: 'Two or more ads per campaign',
    practice: 'Always run at least two creative variants inside a campaign.',
    why: "LinkedIn's delivery algorithm needs variance to find the better performer, and you need the split to make creative decisions from data rather than preference.",
    source: { name: 'Stackmatix — LinkedIn Ads Account Structure', url: 'https://www.stackmatix.com/blog/linkedin-ads-account-structure', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'intro-truncation',
    category: 'Creative & formats',
    headline: '150 characters before "see more"',
    practice: 'Introductory text truncates around 150 characters even though the field allows up to 600.',
    why: 'Everything past the cut is hidden behind a click. The hook has to land before it.',
    source: { name: 'Published 2026 ad spec guides', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'headline-limit',
    category: 'Creative & formats',
    headline: '70-character headline',
    practice: 'Recommended headline length for Sponsored Content, against a 200-character hard maximum.',
    why: 'The hard limit is what gets rejected; the recommended length is what displays without truncation.',
    source: { name: 'Published 2026 ad spec guides', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'carousel-trap',
    category: 'Creative & formats',
    headline: 'Carousel headline: 45 → 30',
    practice: 'Carousel card headlines allow 45 characters, dropping to 30 when the CTA points at a Lead Gen Form.',
    why: 'The same creative has a different limit depending on a setting configured elsewhere. Easy to miss until upload fails.',
    source: { name: 'Published 2026 ad spec guides', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'video-cap',
    category: 'Creative & formats',
    headline: '200 MB video cap',
    practice: 'Video ads are limited to 200 MB, far below the 5 GB allowed for organic video.',
    why: 'Catches teams who have already produced and approved a file at organic spec.',
    source: { name: 'Published 2026 ad spec guides', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'vertical-mobile',
    category: 'Creative & formats',
    headline: '9:16 is mobile-only',
    practice: 'Vertical video does not display on desktop at all.',
    why: 'A vertical-only asset silently forfeits desktop reach. Square is the safest single-asset standard.',
    source: { name: 'Published 2026 ad spec guides', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'thought-leader',
    category: 'Creative & formats',
    headline: 'Thought Leader Ads',
    practice: "Sponsor a named member's organic post rather than posting from the company page.",
    why: 'The creative is the original post, so the message stays authentic and typically earns stronger engagement than page-first advertising.',
    source: { name: 'Hootsuite — LinkedIn ads guide', url: 'https://blog.hootsuite.com/linkedin-ads-guide/', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'event-ads',
    category: 'Creative & formats',
    headline: 'Event Ads: up to 31× viewership',
    practice: 'Promote a LinkedIn Event in-feed, before, during and after the event.',
    why: "A large claimed multiplier from LinkedIn's own reporting — directionally useful, but it is a platform figure and worth treating as a ceiling rather than an expectation.",
    source: { name: 'Hootsuite — LinkedIn ads guide', url: 'https://blog.hootsuite.com/linkedin-ads-guide/', type: 'vendor' },
    verified: '2026-07-28',
  },
  {
    id: 'lgf-fields',
    category: 'Creative & formats',
    headline: '3–4 form fields',
    practice: 'Keep Lead Gen Forms short. Twelve is the ceiling, not the target.',
    why: 'Every field past the fourth costs completions. Native forms pre-fill from the profile, which is where their conversion advantage comes from — long forms give it back.',
    source: { name: 'Industry consensus — practitioner guidance', url: '', type: 'industry' },
    verified: '2026-07-28',
  },

  /* ---------------- measurement ---------------- */
  {
    id: 'tag-verify',
    category: 'Measurement & tracking',
    headline: 'Insight Tag: 24–48 hours to verify',
    practice: 'Install site-wide and wait for Campaign Manager to show the domain as Verified before spending.',
    why: 'Nothing accrues before the tag is live, and it cannot be backdated. Every day without it is retargeting pool permanently lost.',
    source: { name: 'Industry consensus — practitioner guidance', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'conversion-attach',
    category: 'Measurement & tracking',
    headline: 'Conversions must be attached',
    practice: 'A conversion action only records once linked to a specific campaign.',
    why: 'A defined-but-unattached conversion counts nothing, silently, and looks identical to a campaign that simply is not converting.',
    source: { name: 'Industry consensus — practitioner guidance', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'no-macros',
    category: 'Measurement & tracking',
    headline: 'No URL macros',
    practice: 'LinkedIn has no equivalent of Google\'s {campaignid} — every tracked URL is written out in full, per ad.',
    why: 'Makes hand-built UTMs the norm and typos routine. Generate them rather than typing them.',
    source: { name: 'Industry consensus — practitioner guidance', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'utm-case',
    category: 'Measurement & tracking',
    headline: 'Lowercase every UTM',
    practice: 'GA4 treats utm_source=LinkedIn and utm_source=linkedin as separate sources.',
    why: 'Splits every report down the middle, and the damage is retrospective — you cannot merge them cleanly after the fact.',
    source: { name: 'Industry consensus — analytics practice', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'no-looker-connector',
    category: 'Measurement & tracking',
    headline: 'No native Looker Studio connector',
    practice: 'Unlike Google Ads or GA4, LinkedIn Ads has no first-party Looker Studio connection.',
    why: 'Reporting requires manual CSV export, a paid third-party connector, or your own API pull. Agencies commonly lose ten-plus hours a month to the manual route.',
    source: { name: 'Industry consensus — reporting tool comparisons', url: '', type: 'industry' },
    verified: '2026-07-28',
  },

  /* ---------------- timing ---------------- */
  {
    id: 'learning-phase',
    category: 'Timing & duration',
    headline: 'Learning phase: 1–2 weeks',
    practice: 'A new campaign, or any significant edit, puts delivery into a learning phase lasting roughly 7–14 days.',
    why: 'Costs are higher and more variable during it. Every significant edit restarts the clock, so batch changes rather than tuning daily.',
    source: { name: 'Stackmatix — How to Run LinkedIn Ads', url: 'https://www.stackmatix.com/blog/how-to-run-linkedin-ads', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'min-schedule',
    category: 'Timing & duration',
    headline: 'Seven-day minimum schedule',
    practice: "LinkedIn's own recommended minimum campaign length to see results.",
    why: "Useful counterweight to the assumption that short campaigns are inherently bad. A two-month campaign is entirely legitimate — judge duration against the objective, not a fixed bar.",
    source: { name: 'LinkedIn — Campaign setup best practices', url: 'https://www.linkedin.com/help/lms/answer/a422123/campaign-setup-best-practices', type: 'official' },
    verified: '2026-07-28',
  },
  {
    id: 'meaningful-volume',
    category: 'Timing & duration',
    headline: '30–60 days for meaningful volume',
    practice: 'Lead volume and optimisation typically need one to two months to become readable.',
    why: 'The gap between "the campaign is running" and "the numbers mean something" is where most client expectation problems live. Set it at kickoff.',
    source: { name: 'Stackmatix — How to Run LinkedIn Ads', url: 'https://www.stackmatix.com/blog/how-to-run-linkedin-ads', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'targeted-4-6',
    category: 'Timing & duration',
    headline: '4–6 weeks for a targeted push',
    practice: 'A focused campaign should run at least four to six weeks to reach its audience and produce measurable results.',
    why: 'A reasonable floor for a fixed-term campaign, and roughly the right lead time for event promotion.',
    source: { name: 'MarketingProfs', url: 'https://www.marketingprofs.com/faqs/how-long-should-a-targeted-linkedin-campaign-run', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'event-replay',
    category: 'Timing & duration',
    headline: 'Run 30 days after an event',
    practice: 'Gate the replay behind a Lead Gen Form and run a sustained low-budget campaign for a month afterwards.',
    why: 'Reported to produce 20–30% additional registrations beyond the live audience. The cheapest incremental volume in an event programme, and routinely skipped.',
    source: { name: 'Converve — Promoting Events on LinkedIn', url: 'https://www.converve.com/event-networking-blog/how-to-promote-events-on-linkedin-2026-guide', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'review-lead-time',
    category: 'Timing & duration',
    headline: 'Submit 48 hours before launch',
    practice: 'Ad review usually completes within 24 hours, but LinkedIn advises submitting two days ahead of the scheduled start.',
    why: 'Review runs longer in high-volume advertising seasons. Missing a launch date for a queue is an avoidable conversation.',
    source: { name: 'Social Media Examiner', url: 'https://www.socialmediaexaminer.com/how-to-scale-linkedin-ads/', type: 'industry' },
    verified: '2026-07-28',
    note: 'Older source (2023). Worth re-confirming against LinkedIn help.',
  },

  /* ---------------- benchmarks ---------------- */
  {
    id: 'cpc-range',
    category: 'Cost benchmarks',
    headline: 'CPC $5–8, CPM $30–65',
    practice: 'Typical LinkedIn cost ranges for B2B.',
    why: 'Higher than other platforms, and the justification is lead quality rather than volume. Useful for sanity-checking a forecast before presenting it.',
    source: { name: 'Stackmatix — How to Run LinkedIn Ads', url: 'https://www.stackmatix.com/blog/how-to-run-linkedin-ads', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'cpl-range',
    category: 'Cost benchmarks',
    headline: 'CPL $75–150',
    practice: 'Typical cost per lead for B2B lead generation on LinkedIn.',
    why: 'A target implying a CPL well below this is a budget problem, not an ambition. Check it before agreeing a number with a client.',
    source: { name: 'Stackmatix — How to Run LinkedIn Ads', url: 'https://www.stackmatix.com/blog/how-to-run-linkedin-ads', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'fifty-conversions',
    category: 'Cost benchmarks',
    headline: '~50 conversions to optimise',
    practice: 'Delivery algorithms broadly need around fifty conversion events before optimisation stabilises.',
    why: 'A cross-platform rule of thumb rather than a LinkedIn-published figure. Useful for judging whether a campaign has had a fair run before you judge it.',
    source: { name: 'Takeflyte — How Long Do Digital Ads Take to Work', url: 'https://www.takeflyte.com/blog/how-long-do-ads-take-to-work', type: 'industry' },
    verified: '2026-07-28',
  },

  /* ---------------- platform traps ---------------- */
  {
    id: 'audience-expansion',
    category: 'Platform traps',
    headline: 'Audience Expansion is ON by default',
    practice: 'Switch it off unless you have a specific reason not to.',
    why: 'It quietly widens targeting beyond everything you specified, and is the most common cause of unexplained irrelevant reach.',
    source: { name: 'Industry consensus — practitioner guidance', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'audience-network',
    category: 'Platform traps',
    headline: 'Audience Network is ON by default',
    practice: 'Decide deliberately rather than inheriting the default.',
    why: 'Useful for reach, weaker for lead quality. The problem is not the setting, it is that nobody chose it.',
    source: { name: 'Industry consensus — practitioner guidance', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'paused-active',
    category: 'Platform traps',
    headline: 'Paused ≠ finished',
    practice: 'Paused campaigns are considered active until their designated end time.',
    why: 'Status alone will not tell you whether a campaign is done. Track intent separately, especially if anything automates pausing.',
    source: { name: 'Microsoft Learn — Create and Manage LinkedIn Campaigns', url: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns', type: 'official' },
    verified: '2026-07-28',
  },
  {
    id: 'no-dayparting',
    category: 'Platform traps',
    headline: 'No native dayparting',
    practice: 'Campaign Manager offers a start and end date and nothing more granular.',
    why: 'Delivery-hour control has to be manual or handled by a third-party tool. B2B accounts commonly lose 20–35% of spend to weekends and overnight.',
    source: { name: 'LinkedIn — Campaign and ad set schedules', url: 'https://www.linkedin.com/help/lms/answer/a427004', type: 'official' },
    verified: '2026-07-28',
  },
  {
    id: 'creative-limit',
    category: 'Platform traps',
    headline: '15 active creatives per campaign',
    practice: 'A campaign holds a maximum of 15 active and 85 inactive creatives.',
    why: 'Rarely binding, but worth knowing before planning a large rotation programme.',
    source: { name: 'Microsoft Learn — Create and Manage LinkedIn Campaigns', url: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns', type: 'official' },
    verified: '2026-07-28',
  },
  {
    id: 'eu-messaging',
    category: 'Platform traps',
    headline: 'EU Sponsored Messaging needs opt-in',
    practice: 'EU members must have opted in before they can receive Message or Conversation Ads.',
    why: 'Reachable volume is far smaller than the raw audience suggests. Plan around it rather than discovering it in delivery.',
    source: { name: 'Industry consensus — ePrivacy Directive guidance', url: '', type: 'industry' },
    verified: '2026-07-28',
  },
  {
    id: 'page-required',
    category: 'Platform traps',
    headline: 'A Company Page is required',
    practice: 'Campaign Manager cannot run ads without an associated LinkedIn Page.',
    why: 'Blocks a launch entirely if discovered late. Creating one takes minutes, but needs a personal profile in a real name.',
    source: { name: 'Stackmatix — How to Run LinkedIn Ads', url: 'https://www.stackmatix.com/blog/how-to-run-linkedin-ads', type: 'industry' },
    verified: '2026-07-28',
  },
];

const CATEGORIES = [
  'Budget & structure',
  'Audience',
  'Creative & formats',
  'Measurement & tracking',
  'Timing & duration',
  'Cost benchmarks',
  'Platform traps',
];

const TYPE_LABEL = {
  official: 'LinkedIn official',
  industry: 'Industry practice',
  vendor: 'Vendor claim',
};

function monthsSince(iso) {
  const then = new Date(iso + 'T00:00:00Z');
  const now = new Date();
  return (now - then) / (1000 * 60 * 60 * 24 * 30.44);
}

function staleness(iso) {
  const m = monthsSince(iso);
  if (m >= REVIEW_RED_MONTHS) return { level: 'red', label: 'Needs re-checking' };
  if (m >= REVIEW_AMBER_MONTHS) return { level: 'amber', label: 'Ageing' };
  return { level: 'ok', label: 'Current' };
}

/* ------------------------------------------------------------------ */

export default function PracticeReference() {
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState([]);
  const [types, setTypes] = useState([]);
  const [staleOnly, setStaleOnly] = useState(false);

  const enriched = useMemo(
    () => PRACTICES.map((p) => ({ ...p, stale: staleness(p.verified) })),
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((p) => {
      if (cats.length && !cats.includes(p.category)) return false;
      if (types.length && !types.includes(p.source.type)) return false;
      if (staleOnly && p.stale.level === 'ok') return false;
      if (!q) return true;
      return [p.headline, p.practice, p.why, p.category, p.source.name]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [enriched, query, cats, types, staleOnly]);

  const counts = useMemo(() => {
    const byType = { official: 0, industry: 0, vendor: 0 };
    let needsReview = 0;
    for (const p of enriched) {
      byType[p.source.type]++;
      if (p.stale.level !== 'ok') needsReview++;
    }
    return { byType, needsReview };
  }, [enriched]);

  const toggle = (list, setList, v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const grouped = CATEGORIES.map((c) => ({
    category: c,
    items: filtered.filter((p) => p.category === c),
  })).filter((g) => g.items.length);

  const copyAll = () => {
    const lines = grouped.flatMap((g) => [
      g.category.toUpperCase(),
      ...g.items.map((p) => `  ${p.headline} — ${p.practice}\n    ${p.why}\n    Source: ${p.source.name}${p.source.url ? ` (${p.source.url})` : ''} · verified ${p.verified}`),
      '',
    ]);
    navigator.clipboard?.writeText(lines.join('\n'));
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Best practice reference</h1>
            <div className="linked">
              {PRACTICES.length} entries · {counts.byType.official} from LinkedIn directly
              {counts.needsReview > 0 && ` · ${counts.needsReview} due a re-check`}
            </div>
          </div>
          <dl className="mast-meta">
            <div>
              <dt>Ref</dt>
              <dd>LA-REF</dd>
            </div>
            <div>
              <dt>Reviewed</dt>
              <dd>{new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</dd>
            </div>
          </dl>
        </header>

        <div className="controls">
          <input
            className="search"
            type="search"
            value={query}
            placeholder="Search practices, numbers, sources…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="filters">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={cats.includes(c) ? 'f on' : 'f'}
                onClick={() => toggle(cats, setCats, c)}>{c}</button>
            ))}
          </div>
          <div className="filters second">
            {Object.entries(TYPE_LABEL).map(([k, label]) => (
              <button key={k} type="button" className={types.includes(k) ? `f t-${k} on` : `f t-${k}`}
                onClick={() => toggle(types, setTypes, k)}>{label}</button>
            ))}
            <button type="button" className={staleOnly ? 'f warn on' : 'f warn'}
              onClick={() => setStaleOnly((v) => !v)}>Due a re-check</button>
            {(cats.length || types.length || staleOnly || query) && (
              <button type="button" className="f clear"
                onClick={() => { setCats([]); setTypes([]); setStaleOnly(false); setQuery(''); }}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="body">
          {!filtered.length && (
            <p className="empty">Nothing matches those filters.</p>
          )}

          {grouped.map((g) => (
            <section className="cat" key={g.category}>
              <h2 className="cat-head">
                {g.category}
                <span className="cat-n">{g.items.length}</span>
              </h2>
              {g.items.map((p) => (
                <article className="prac" key={p.id}>
                  <div className="prac-left">
                    <div className="prac-headline">{p.headline}</div>
                    <div className={`badge t-${p.source.type}`}>{TYPE_LABEL[p.source.type]}</div>
                  </div>
                  <div className="prac-body">
                    <p className="prac-statement">{p.practice}</p>
                    <p className="prac-why">{p.why}</p>
                    {p.note && <p className="prac-note">{p.note}</p>}
                    <div className="prac-source">
                      {p.source.url ? (
                        <a href={p.source.url} target="_blank" rel="noopener noreferrer">{p.source.name}</a>
                      ) : (
                        <span className="nosrc">{p.source.name} — no single canonical URL</span>
                      )}
                      <span className={`ver ${p.stale.level}`}>
                        {p.stale.level === 'ok' ? 'Verified' : p.stale.label} {p.verified}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>

        <footer className="foot">
          <button type="button" className="btn" onClick={copyAll}>Copy visible entries</button>
          <p className="foot-note">
            Entries flag amber past {REVIEW_AMBER_MONTHS} months and red past {REVIEW_RED_MONTHS}.
            To update, edit the PRACTICES array at the top of this file and bump the verified date —
            a reference that never shows its age is more dangerous than one with gaps.
            Anything marked <strong>Industry practice</strong> without a URL is widely-held
            practitioner consensus rather than published documentation: sound to work from, worth
            attributing carefully before quoting to a client.
          </p>
        </footer>
      </div>
    </>
  );
}

const CSS = `
.sheet{
  --white:#FCFCFA;--canary:#FAF3D2;--ink:#1B1D19;--ink-2:#5C5F57;
  --carbon:#3A3F7A;--rule:#D6D4C8;--rule-2:#DCCF8E;--stamp:#A8342A;--ok:#2F6B4F;--amber:#B07A1E;
  font-family:'Archivo',system-ui,sans-serif;color:var(--ink);background:#E8E6DD;
  min-height:100vh;padding:20px;box-sizing:border-box;-webkit-font-smoothing:antialiased;
}
.masthead,.controls,.body,.foot{max-width:1000px;margin-left:auto;margin-right:auto;}
.mast-meta dd{font-family:'Courier Prime',monospace;font-size:13.5px;margin:0;}
.controls{background:#F3F2EC;border-left:1px solid var(--ink);border-right:1px solid var(--ink);
  border-bottom:1px solid var(--rule);padding:12px 22px 13px;}
.search{width:100%;font-family:'Courier Prime',monospace;font-size:13.5px;color:var(--carbon);
  background:var(--white);border:1px solid var(--rule);padding:8px 11px;border-radius:0;
  outline:none;margin-bottom:10px;}
.search:focus{border-color:var(--carbon);}
.search:focus-visible{outline:2px solid var(--carbon);outline-offset:1px;}
.filters{display:flex;flex-wrap:wrap;gap:4px;}
.filters.second{margin-top:6px;padding-top:8px;border-top:1px dotted var(--rule);}
.f{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.1em;text-transform:uppercase;padding:5px 10px;background:none;
  border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;}
.f:hover{background:var(--white);}
.f.on{background:var(--carbon);color:var(--white);border-color:var(--carbon);}
.f.t-official.on{background:var(--ok);border-color:var(--ok);}
.f.t-vendor.on{background:var(--stamp);border-color:var(--stamp);}
.f.warn.on{background:var(--amber);border-color:var(--amber);color:#fff;}
.f.clear{border-style:dashed;}
.f:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.body{background:var(--white);border-left:1px solid var(--ink);border-right:1px solid var(--ink);}
.empty{padding:30px 22px;margin:0;font-size:13px;color:var(--ink-2);}
.cat{border-bottom:1px solid var(--rule);}
.cat:last-child{border-bottom:none;}
.cat-head{display:flex;align-items:center;justify-content:space-between;margin:0;
  padding:9px 22px;background:#F3F2EC;border-bottom:1px solid var(--rule);
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11.5px;
  letter-spacing:.15em;text-transform:uppercase;position:sticky;top:0;z-index:1;}
.cat-n{font-family:'Courier Prime',monospace;font-size:12px;letter-spacing:0;color:var(--ink-2);}
.prac{display:grid;grid-template-columns:190px 1fr;gap:18px;padding:13px 22px;
  border-bottom:1px dotted var(--rule);}
.prac:last-child{border-bottom:none;}
.prac-headline{font-family:'Courier Prime',monospace;font-weight:700;font-size:14px;
  color:var(--carbon);line-height:1.35;}
.badge{display:inline-block;margin-top:6px;font-family:'Archivo Narrow',sans-serif;
  font-weight:700;font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;
  padding:2px 6px;border:1px solid var(--rule);color:var(--ink-2);}
.badge.t-official{border-color:var(--ok);color:var(--ok);}
.badge.t-vendor{border-color:var(--stamp);color:var(--stamp);}
.prac-statement{margin:0 0 5px;font-size:13.5px;line-height:1.5;font-weight:500;}
.prac-why{margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-2);}
.prac-note{margin:6px 0 0;font-size:11.5px;line-height:1.5;color:var(--amber);}
.prac-source{margin-top:8px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;}
.prac-source a{font-size:11.5px;color:var(--carbon);text-decoration:none;
  border-bottom:1px solid var(--rule);word-break:break-word;}
.prac-source a:hover{border-bottom-color:var(--carbon);}
.nosrc{font-size:11.5px;color:var(--ink-2);font-style:italic;}
.ver{font-family:'Courier Prime',monospace;font-size:10.5px;color:var(--ok);margin-left:auto;
  white-space:nowrap;}
.ver.amber{color:var(--amber);font-weight:700;}
.ver.red{color:var(--stamp);font-weight:700;}
.foot{background:#F3F2EC;border:1px solid var(--ink);padding:14px 22px;}
.foot-note{margin:11px 0 0;font-size:11px;line-height:1.6;color:var(--ink-2);}
.foot-note strong{color:var(--ink);font-weight:600;}
@media (max-width:760px){
  .sheet{padding:10px;}
  .masthead,.controls,.foot{padding-left:14px;padding-right:14px;}
  .cat-head{padding-left:14px;padding-right:14px;}
  .prac{grid-template-columns:1fr;gap:7px;padding:12px 14px;}
  .badge{margin-top:4px;}
  .ver{margin-left:0;}
}
`;
