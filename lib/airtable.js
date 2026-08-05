/**
 * Airtable REST client.
 *
 * Server-side only. The personal access token is a write credential for the
 * whole base, so it never reaches the browser — the intake form posts to
 * /api/airtable/brief and this module does the talking.
 *
 * Deliberately not the airtable npm package: one POST does not justify a
 * dependency, and the error handling below is more useful than the
 * package's, which swallows the field name Airtable objected to.
 */

const API = 'https://api.airtable.com/v0';

export function airtableConfig() {
  return {
    token: process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY || '',
    baseId: process.env.AIRTABLE_BASE_ID || '',
    table: process.env.AIRTABLE_BRIEFS_TABLE || 'Briefs',
  };
}

export function isConfigured() {
  const { token, baseId } = airtableConfig();
  return Boolean(token && baseId);
}

/**
 * Creates one record.
 *
 * `typecast` is on so a select field accepts a value it has not seen before
 * rather than rejecting the whole record — an intake form should never fail
 * because a client works in a sector nobody has typed into Airtable yet.
 */
export async function createRecord(fields, { table } = {}) {
  const cfg = airtableConfig();
  if (!cfg.token || !cfg.baseId) {
    throw new Error(
      'Airtable is not configured. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID, and AIRTABLE_BRIEFS_TABLE if the table is not called "Briefs".'
    );
  }

  const url = `${API}/${cfg.baseId}/${encodeURIComponent(table || cfg.table)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields, typecast: true }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error;
    const detail = typeof err === 'string' ? err : err?.message || res.statusText;
    /* UNKNOWN_FIELD_NAME is the failure everyone hits first, and Airtable's
     * own message names the field — pass it through rather than flattening
     * it to "422". */
    throw new Error(`Airtable rejected the record (${res.status}): ${detail}`);
  }

  return {
    id: body.id,
    url: `https://airtable.com/${cfg.baseId}/${body.id}`,
    createdTime: body.createdTime,
  };
}

/**
 * Maps a discovery brief onto Airtable fields.
 *
 * Field names match the columns in the Briefs table. Anything empty is
 * dropped rather than written as "", which keeps Airtable's own "is empty"
 * filters working.
 */
export function briefToFields(brief = {}, extras = {}) {
  const fields = {
    Client: brief.client,
    Sector: brief.sector,
    Website: brief.website,
    Markets: brief.markets,
    Objective: brief.objective,
    'Success looks like': brief.successLooksLike,
    'Target leads per month': num(brief.targetLeads),
    'Average deal size': num(brief.dealSize),
    'Total budget': num(brief.budget),
    'Duration (months)': num(brief.months),
    'Start date': brief.startDate || undefined,
    'Planned campaigns': num(brief.campaignCount),
    'Job titles': brief.jobTitles,
    Seniority: brief.seniority,
    'Company size': brief.companySize,
    'Audience size': num(brief.audienceSize),
    'Target account list': brief.targetAccountList,
    'Running now': brief.runningNow,
    'Insight Tag': brief.insightTag,
    'Conversion tracking': brief.conversionTracking,
    CRM: brief.crm,
    'Lead routing': brief.leadRouting,
    'Landing pages': brief.landingPages,
    Assets: Array.isArray(brief.assets) && brief.assets.length ? brief.assets.join(', ') : undefined,
    Constraints: brief.constraints,
    Flags: extras.flags || undefined,
    Captured: new Date().toISOString().slice(0, 10),
  };

  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') delete fields[k];
  }
  return fields;
}

function num(v) {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
