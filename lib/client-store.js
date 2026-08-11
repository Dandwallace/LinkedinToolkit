/**
 * Per-client store for uploaded Campaign Manager exports.
 *
 * The toolkit runs three accounts, so an upload has to be filed against one
 * of them rather than replacing "the current data". Everything lives in the
 * same browser localStorage as the rest of the tools, via lib/storage.
 *
 * Uploads are aggregated to campaign level before saving. A daily export of
 * thirty campaigns over ninety days is 2,700 rows; localStorage gives you
 * around 5 MB for everything, and the dashboard only ever asks questions at
 * campaign level. The daily rows stay in the analysis page where they were
 * uploaded.
 */

import { storage } from '@/lib/storage';

export const CLIENTS = [
  { id: 'marken', name: 'Marken' },
  { id: 'pci', name: 'PCI' },
  { id: 'gcsg', name: 'GCSG' },
];

export const clientName = (id) => CLIENTS.find((c) => c.id === id)?.name || id;

const KEY = (id) => `client:${id}`;

/* ------------------------------------------------------------------ *
 * Health thresholds.
 *
 * MIN_DAILY is LinkedIn's practical floor — below it delivery is erratic
 * and nothing accumulates enough data to optimise. PRACTICAL_DAILY is the
 * B2B floor: technically fine, but too thin to expect a conversion
 * objective to learn anything. They are separate flags because they lead to
 * different conversations with a client.
 *
 * CTR_MIN_IMPRESSIONS keeps the CTR flag off campaigns that have barely
 * delivered — 1 click in 200 impressions is 0.5% and means nothing either
 * way, and a flag that fires on noise stops being read.
 * ------------------------------------------------------------------ */
export const THRESHOLDS = {
  MIN_DAILY: 10,
  PRACTICAL_DAILY: 75,
  MAX_FREQUENCY: 5,
  MIN_CTR: 0.2,
  CTR_MIN_IMPRESSIONS: 1000,
};

/**
 * The five states, in the order they are displayed.
 *
 * Only `active` statuses are candidates for healthy or flagged. Everything
 * else is inactive, and an inactive campaign must never be counted as
 * running, so an unrecognised status resolves to complete rather than
 * falling through to healthy.
 */
export const STATES = ['healthy', 'flagged', 'paused', 'building', 'complete'];

const STATUS_STATE = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DRAFT: 'building',
  COMPLETED: 'complete',
  ARCHIVED: 'complete',
  CANCELLED: 'complete',
};

/** Where a raw export status lands. Unknown means inactive, not running. */
export function stateForStatus(status) {
  if (!status) return 'active';
  return STATUS_STATE[status] || 'complete';
}

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

/**
 * Derives one campaign's health.
 *
 * Returns `{ state, flags }` where state is one of STATES. Inactive
 * campaigns are never flagged: a paused campaign spending nothing is the
 * system working, and flagging it buries the ones that matter.
 */
export function healthOf(campaign) {
  const base = stateForStatus(campaign.status || null);
  if (base !== 'active') {
    return { state: base, flags: [] };
  }

  /* Nominally active but never started: no impressions and a start date
   * still in the future. Counting these as healthy overstates what is
   * actually running, and flagging them invents a problem. */
  const impressionsSoFar = Number(campaign.impressions) || 0;
  if (impressionsSoFar === 0 && isFuture(campaign.startDate)) {
    return { state: 'building', flags: [] };
  }

  /* Past its end date is finished whatever the status column still says. */
  if (isPast(campaign.endDate)) {
    return { state: 'complete', flags: [] };
  }

  const flags = [];
  const impressions = Number(campaign.impressions) || 0;
  const clicks = Number(campaign.clicks) || 0;
  const spend = Number(campaign.spend) || 0;
  const frequency = Number(campaign.frequency) || 0;
  const daily = campaign.dailyBudget == null ? null : Number(campaign.dailyBudget);
  const ctr = impressions ? (clicks / impressions) * 100 : 0;

  /* The silent failure: live, funded, and delivering nothing. Usually a
   * declined card, a rejected ad, or an audience that has collapsed. None
   * of it shows as an error in Campaign Manager. */
  if (impressions === 0) {
    flags.push({
      id: 'no-delivery',
      level: 'urgent',
      label: 'No delivery',
      detail:
        'Active but no impressions in this export. Check billing, ad review status, and whether the audience has fallen below the delivery threshold.',
    });
  }

  if (frequency > THRESHOLDS.MAX_FREQUENCY) {
    flags.push({
      id: 'frequency',
      level: 'warn',
      label: `Frequency ${frequency.toFixed(1)}`,
      detail: `Above ${THRESHOLDS.MAX_FREQUENCY}. The same people are seeing this repeatedly, so engagement decays and negative feedback climbs. Widen the audience or rotate creative.`,
    });
  }

  if (daily != null && daily > 0) {
    if (daily < THRESHOLDS.MIN_DAILY) {
      flags.push({
        id: 'budget-floor',
        level: 'urgent',
        label: `$${daily.toFixed(2)}/day`,
        detail: `Under the $${THRESHOLDS.MIN_DAILY}/day floor. Delivery becomes erratic and the campaign never accumulates enough data to optimise.`,
      });
    } else if (daily < THRESHOLDS.PRACTICAL_DAILY) {
      flags.push({
        id: 'budget-thin',
        level: 'warn',
        label: `$${daily.toFixed(2)}/day`,
        detail: `Under the $${THRESHOLDS.PRACTICAL_DAILY}/day practical floor for B2B. Technically it will run; it will not gather enough signal to be worth reporting on.`,
      });
    }
  }

  if (impressions >= THRESHOLDS.CTR_MIN_IMPRESSIONS && ctr < THRESHOLDS.MIN_CTR) {
    flags.push({
      id: 'ctr',
      level: 'warn',
      label: `CTR ${ctr.toFixed(2)}%`,
      detail: `Under ${THRESHOLDS.MIN_CTR}% across ${impressions.toLocaleString('en-GB')} impressions. Either the creative is not landing or the audience is wrong for it.`,
    });
  }

  return {
    state: flags.length ? 'flagged' : 'healthy',
    flags,
    metrics: { impressions, clicks, spend, ctr, frequency, dailyBudget: daily },
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const isFuture = (iso) => Boolean(iso) && iso > today();
const isPast = (iso) => Boolean(iso) && iso < today();

/* ------------------------------------------------------------------ *
 * Shaping an upload
 * ------------------------------------------------------------------ */

/**
 * Rolls rows up to one record per campaign, with health attached.
 *
 * `level` picks which rung of the hierarchy to group by: 'unit' is the ad
 * set (the thing that actually spends), 'group' is the campaign above it.
 */
export function toCampaigns(rows, level = 'unit') {
  const byName = new Map();

  for (const r of rows) {
    const key =
      level === 'group'
        ? r.group || r.campaignGroup || r.campaign
        : r.adSetId || r.campaignId || r.unit || r.campaign;
    if (!byName.has(key)) {
      byName.set(key, {
        name: level === 'group' ? r.group || r.campaignGroup || r.campaign : r.unit || r.campaign,
        campaignId: level === 'group' ? null : r.adSetId || r.campaignId,
        group: r.group || r.campaignGroup,
        adSetType: r.adSetType || null,
        startDate: r.startDate || null,
        endDate: r.endDate || null,
        status: level === 'group' ? r.groupStatus || r.status : r.status,
        impressions: 0,
        clicks: 0,
        spend: 0,
        leads: 0,
        conversions: 0,
        reach: 0,
        frequencySum: 0,
        frequencyRows: 0,
        dailyBudget: r.dailyBudget ?? null,
        days: new Set(),
      });
    }
    const c = byName.get(key);
    c.impressions += r.impressions;
    c.clicks += r.clicks;
    c.spend += r.spend;
    c.leads += r.leads;
    c.conversions += r.conversions;
    c.reach = Math.max(c.reach, r.reach || 0);
    if (r.frequency) {
      c.frequencySum += r.frequency;
      c.frequencyRows++;
    }
    if (r.dailyBudget != null) c.dailyBudget = r.dailyBudget;
    if (r.status && !c.status) c.status = r.status;
    if (r.date) c.days.add(r.date);
  }

  return [...byName.values()].map((c) => {
    /* Reach is a de-duplicated count, so it cannot be summed across days.
     * Where LinkedIn gave a per-row frequency, average it; otherwise fall
     * back to impressions over the largest reach figure seen. */
    const frequency = c.frequencyRows
      ? c.frequencySum / c.frequencyRows
      : c.reach
        ? c.impressions / c.reach
        : 0;
    const campaign = {
      name: c.name,
      campaignId: c.campaignId,
      group: c.group,
      adSetType: c.adSetType,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      impressions: c.impressions,
      clicks: c.clicks,
      spend: c.spend,
      leads: c.leads,
      conversions: c.conversions,
      reach: c.reach,
      frequency,
      dailyBudget: c.dailyBudget,
      days: c.days.size,
      ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
    };
    const health = healthOf(campaign);
    return { ...campaign, state: health.state, flags: health.flags };
  });
}

/** Counts by state, plus the proportions the dashboard bar is drawn from. */
export function countsOf(campaigns = []) {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const c of campaigns) {
    if (counts[c.state] === undefined) counts[c.state] = 0;
    counts[c.state]++;
  }
  const total = campaigns.length;
  const pct = Object.fromEntries(
    STATES.map((s) => [s, total ? (counts[s] / total) * 100 : 0])
  );
  return { ...counts, total, pct };
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

/**
 * Files a parsed export against a client, replacing whatever was there.
 *
 * Replace rather than merge: two exports of overlapping date ranges would
 * double-count, and there is no reliable key to de-duplicate daily rows on
 * across report types. The date range is stored so the dashboard can say
 * how old the picture is.
 */
export async function saveClientData(clientId, parsed, meta = {}) {
  if (!CLIENTS.some((c) => c.id === clientId)) {
    throw new Error(`Unknown client "${clientId}"`);
  }
  const campaigns = toCampaigns(parsed.rows, 'unit');
  const groups = toCampaigns(parsed.rows, 'group');
  const record = {
    clientId,
    savedAt: new Date().toISOString(),
    filename: meta.filename || parsed.filename || null,
    granularity: parsed.granularity,
    /* The export's own column names, so the dashboard calls the two rungs
     * whatever Campaign Manager called them in this file. */
    labels: parsed.labels || { group: 'Campaign group', unit: 'Campaign' },
    from: parsed.from,
    to: parsed.to,
    days: parsed.days,
    rowCount: parsed.rows.length,
    totals: parsed.totals,
    campaigns,
    groups,
  };
  await storage.set(KEY(clientId), JSON.stringify(record));
  return record;
}

/** Returns the stored record, or null when nothing has been uploaded. */
export async function loadClientData(clientId) {
  try {
    const r = await storage.get(KEY(clientId));
    const parsed = JSON.parse(r.value);
    /* Health is recomputed on read so a threshold change takes effect
     * without needing every client's export uploading again. */
    const rehealth = (list) =>
      (list || []).map((c) => {
        const h = healthOf(c);
        return { ...c, state: h.state, flags: h.flags };
      });
    const campaigns = rehealth(parsed.campaigns);
    /* Records saved before the two-level model have no groups array. Fall
     * back to the unit level so an old upload still renders. */
    const groups = parsed.groups ? rehealth(parsed.groups) : [];
    return {
      ...parsed,
      labels: parsed.labels || { group: 'Campaign group', unit: 'Campaign' },
      campaigns,
      groups,
      counts: countsOf(campaigns),
      groupCounts: countsOf(groups),
    };
  } catch {
    return null;
  }
}

export async function clearClientData(clientId) {
  await storage.delete(KEY(clientId));
}

/** Every client, in the order they are listed. Empty ones come back null. */
export async function loadAllClients() {
  const out = [];
  for (const c of CLIENTS) {
    const data = await loadClientData(c.id);
    out.push({ ...c, data, counts: data ? data.counts : countsOf([]) });
  }
  return out;
}

/**
 * The running campaigns for one client, gathered under their group.
 *
 * Only healthy and flagged appear: those are the two states that are
 * actually delivering, and a list headed "active" that includes paused
 * campaigns is worse than no list.
 */
export function activeByGroup(data) {
  if (!data?.campaigns) return [];
  const running = data.campaigns.filter((c) => c.state === 'healthy' || c.state === 'flagged');
  const byGroup = new Map();
  for (const c of running) {
    const key = c.group || 'Ungrouped';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(c);
  }
  return [...byGroup.entries()]
    .map(([group, campaigns]) => ({
      group,
      spend: campaigns.reduce((n, c) => n + c.spend, 0),
      campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    }))
    .sort((a, b) => b.spend - a.spend);
}

/**
 * Every flagged campaign across every client, worst first.
 *
 * Urgent flags outrank warnings, then spend — a flagged campaign burning
 * £4,000 matters more than one burning £40, whatever the flag says.
 */
export async function flaggedAcrossClients() {
  const clients = await loadAllClients();
  const out = [];
  for (const c of clients) {
    for (const campaign of c.data?.campaigns || []) {
      if (campaign.state !== 'flagged') continue;
      out.push({ client: c.name, clientId: c.id, ...campaign });
    }
  }
  const worst = (c) => (c.flags.some((f) => f.level === 'urgent') ? 0 : 1);
  return out.sort((a, b) => worst(a) - worst(b) || b.spend - a.spend);
}
