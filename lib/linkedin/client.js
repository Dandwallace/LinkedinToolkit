import { getAccessToken, config } from './auth.js';

const BASE = 'https://api.linkedin.com/rest';

/**
 * Thin wrapper over LinkedIn's REST API.
 *
 * LinkedIn versions this API monthly and sunsets versions after roughly a
 * year, and endpoint shapes shift between them. If a call starts failing with
 * a 400, check the current docs before assuming a bug here.
 */
async function request(path, { method = 'GET', body, query, retries = 2 } = {}) {
  const token = await getAccessToken();
  const url = new URL(BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': config().apiVersion,
    'X-Restli-Protocol-Version': '2.0.0',
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
    if (method === 'PARTIAL_UPDATE') headers['X-RestLi-Method'] = 'PARTIAL_UPDATE';
  }

  const res = await fetch(url, {
    method: method === 'PARTIAL_UPDATE' ? 'POST' : method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    await new Promise((r) => setTimeout(r, (3 - retries) * 2000 + 1000));
    return request(path, { method, body, query, retries: retries - 1 });
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LinkedIn ${res.status} on ${method} ${path}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function listAdAccounts() {
  const d = await request('/adAccounts', { query: { q: 'search' } });
  return (d?.elements ?? []).map((a) => ({
    id: a.id, name: a.name, status: a.status, currency: a.currency,
  }));
}

export async function listCampaigns(accountId) {
  const d = await request(`/adAccounts/${accountId}/adCampaigns`, { query: { q: 'search' } });
  return (d?.elements ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    type: c.type,
    dailyBudget: c.dailyBudget?.amount,
    currency: c.dailyBudget?.currencyCode,
  }));
}

/**
 * Flips a campaign between ACTIVE and PAUSED.
 *
 * Worth knowing: LinkedIn treats a PAUSED campaign as still live until its
 * scheduled end date, so status alone will not tell you whether a campaign is
 * finished. Track intent separately — see the action log.
 */
export async function setCampaignStatus(accountId, campaignId, status) {
  if (!['ACTIVE', 'PAUSED'].includes(status)) {
    throw new Error(`Refusing to set unexpected status: ${status}`);
  }
  return request(`/adAccounts/${accountId}/adCampaigns/${campaignId}`, {
    method: 'PARTIAL_UPDATE',
    body: { patch: { $set: { status } } },
  });
}

export async function getAnalytics({ accountId, start, end, pivot = 'CAMPAIGN' }) {
  const fmt = (d) => `(day:${d.getUTCDate()},month:${d.getUTCMonth() + 1},year:${d.getUTCFullYear()})`;
  const fields = [
    'impressions', 'clicks', 'costInLocalCurrency',
    'externalWebsiteConversions', 'oneClickLeads', 'dateRange', 'pivotValues',
  ].join(',');

  const d = await request('/adAnalytics', {
    query: {
      q: 'analytics',
      pivot,
      timeGranularity: 'DAILY',
      dateRange: `(start:${fmt(start)},end:${fmt(end)})`,
      accounts: `List(urn%3Ali%3AsponsoredAccount%3A${accountId})`,
      fields,
    },
  });
  return d?.elements ?? [];
}

export { request };

/* ------------------------------------------------------------------ *
 * Reach, frequency and demographic reporting
 *
 * These carry constraints the ordinary analytics call does not:
 *
 *  - approximateMemberReach is available for NON-demographic pivots only,
 *    so per-company frequency does not exist. Campaign level is the floor.
 *  - Reach and frequency are non-aggregatable: daily figures cannot be
 *    summed into a weekly one. Every window must be queried directly,
 *    which is why these use timeGranularity=ALL rather than DAILY.
 *  - Reach is unavailable beyond a 92-day range.
 *  - Demographic pivots drop values with fewer than 3 events, return only
 *    the top 100 values per creative per day, and lag 12–24 hours.
 * ------------------------------------------------------------------ */

const REACH_MAX_DAYS = 92;

const dateRangeOf = (start, end) => {
  const f = (d) => `(day:${d.getUTCDate()},month:${d.getUTCMonth() + 1},year:${d.getUTCFullYear()})`;
  return `(start:${f(start)},end:${f(end)})`;
};

/**
 * Reach and frequency for one window, at campaign level.
 * Returns null rather than a wrong number when the window is too long.
 */
export async function getReachAndFrequency({ accountId, start, end }) {
  const days = Math.ceil((end - start) / 86400000);
  if (days > REACH_MAX_DAYS) {
    return { unavailable: `Reach is only reported for windows of ${REACH_MAX_DAYS} days or fewer.`, days };
  }

  const d = await request('/adAnalytics', {
    query: {
      q: 'analytics',
      pivot: 'CAMPAIGN',
      timeGranularity: 'ALL',
      dateRange: dateRangeOf(start, end),
      accounts: `List(urn%3Ali%3AsponsoredAccount%3A${accountId})`,
      fields: 'impressions,clicks,costInLocalCurrency,approximateMemberReach,pivotValues',
    },
  });

  return {
    days,
    rows: (d?.elements ?? []).map((r) => {
      const impressions = Number(r.impressions ?? 0);
      const reach = Number(r.approximateMemberReach ?? 0);
      return {
        campaignId: (r.pivotValues?.[0] ?? '').split(':').pop() ?? '',
        impressions,
        clicks: Number(r.clicks ?? 0),
        spend: Number(r.costInLocalCurrency ?? 0),
        reach,
        frequency: reach ? impressions / reach : null,
      };
    }),
  };
}

/** Engagement grouped by the viewer's company. Names resolved separately. */
export async function getCompanyEngagement({ accountId, start, end }) {
  const d = await request('/adAnalytics', {
    query: {
      q: 'analytics',
      pivot: 'MEMBER_COMPANY',
      timeGranularity: 'ALL',
      dateRange: dateRangeOf(start, end),
      accounts: `List(urn%3Ali%3AsponsoredAccount%3A${accountId})`,
      fields: 'impressions,clicks,costInLocalCurrency,externalWebsiteConversions,oneClickLeads,pivotValues',
    },
  });

  return (d?.elements ?? [])
    .map((r) => {
      const urn = r.pivotValues?.[0] ?? '';
      return {
        urn,
        organizationId: urn.split(':').pop() ?? '',
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        spend: Number(r.costInLocalCurrency ?? 0),
        conversions: Number(r.externalWebsiteConversions ?? 0),
        leads: Number(r.oneClickLeads ?? 0),
      };
    })
    .filter((r) => r.organizationId)
    .sort((a, b) => b.impressions - a.impressions);
}

/**
 * Resolves organisation URNs to names. The analytics response carries only
 * URNs, so without this the report is a list of numbers.
 *
 * Batched, and failure-tolerant: a company that cannot be resolved keeps its
 * ID rather than dropping out of the report entirely.
 */
export async function resolveOrganizations(ids) {
  const out = new Map();
  const unique = [...new Set(ids)].filter(Boolean);

  for (let i = 0; i < unique.length; i += 20) {
    const batch = unique.slice(i, i + 20);
    try {
      const d = await request('/organizationsLookup', {
        query: { ids: `List(${batch.join(',')})` },
      });
      for (const [id, org] of Object.entries(d?.results ?? {})) {
        if (org?.localizedName) out.set(String(id), org.localizedName);
      }
    } catch {
      /* Name lookup needs its own permission and may not be granted.
       * The report still works with IDs — degrade rather than fail. */
    }
  }
  return out;
}
