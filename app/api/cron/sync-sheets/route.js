import { NextResponse } from 'next/server';
import { getAnalytics, listCampaigns } from '@/lib/linkedin/client';
import { replaceTab, ensureTab, safeTabName } from '@/lib/google/sheets';
import config from '@/config/clients.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const HEADER = [
  'date', 'client', 'account_id', 'campaign_id', 'campaign',
  'impressions', 'clicks', 'spend', 'conversions', 'leads',
  'ctr', 'cpc', 'cpm', 'cost_per_lead',
];

/**
 * Pulls every enabled client and writes:
 *
 *   - one combined tab, for the internal dashboard
 *   - one tab per client, for that client's own report
 *
 * Per-client tabs rather than one table with a filter, deliberately. A filter
 * in Looker Studio is a configuration that can be got wrong; a tab that only
 * ever contains one client's rows cannot leak another's even if the report is
 * misconfigured. At a small client count the extra tabs cost nothing, and the
 * failure mode being prevented is showing one client another's budget.
 *
 * Rewrites a rolling window every run rather than appending, because LinkedIn
 * backdates conversions as they arrive. Append-only would leave permanently
 * wrong recent history — with no error to notice.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  const dryRun = new URL(request.url).searchParams.get('dry') === '1';

  if (!config.spreadsheetId) {
    return NextResponse.json({ error: 'No spreadsheetId in config/clients.json' }, { status: 500 });
  }

  const enabled = (config.clients ?? []).filter((c) => c.enabled !== false && c.accountId);
  if (!enabled.length) {
    return NextResponse.json({ ok: true, message: 'No enabled clients in config/clients.json' });
  }

  const days = Math.min(365, Math.max(7, config.windowDays || 90));
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  const byClient = new Map();
  const failures = [];

  for (const client of enabled) {
    try {
      const [analytics, campaigns] = await Promise.all([
        getAnalytics({ accountId: client.accountId, start, end }),
        listCampaigns(client.accountId),
      ]);
      const nameById = new Map(campaigns.map((c) => [String(c.id), c.name]));
      const rows = [];

      for (const r of analytics) {
        const campaignId = (r.pivotValues?.[0] ?? '').split(':').pop() ?? '';
        const d = r.dateRange?.start;
        if (!d) continue;

        const impressions = Number(r.impressions ?? 0);
        const clicks = Number(r.clicks ?? 0);
        const spend = Number(r.costInLocalCurrency ?? 0);
        const leads = Number(r.oneClickLeads ?? 0);

        rows.push([
          `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
          client.name,
          client.accountId,
          campaignId,
          nameById.get(campaignId) ?? '',
          impressions,
          clicks,
          Number(spend.toFixed(2)),
          Number(r.externalWebsiteConversions ?? 0),
          leads,
          impressions ? Number(((clicks / impressions) * 100).toFixed(3)) : 0,
          clicks ? Number((spend / clicks).toFixed(2)) : 0,
          impressions ? Number(((spend / impressions) * 1000).toFixed(2)) : 0,
          leads ? Number((spend / leads).toFixed(2)) : 0,
        ]);
      }

      /* Oldest first — Looker Studio time series behave better that way. */
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      byClient.set(client.name, rows);
    } catch (err) {
      /* One client failing must not cost the others their refresh. */
      failures.push({ client: client.name, error: err.message });
    }
  }

  const combined = [...byClient.values()].flat()
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const summary = [...byClient.entries()].map(([name, rows]) => ({ client: name, rows: rows.length }));

  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, days,
      combinedRows: combined.length,
      tabs: [config.combinedTab || 'All clients',
        ...(config.perClientTabs !== false ? [...byClient.keys()].map(safeTabName) : [])],
      perClient: summary, failures,
    });
  }

  /* Writing an empty table would wipe the sheet. If nothing came back at all,
   * leave what is there and report the failure instead. */
  if (!combined.length) {
    return NextResponse.json(
      { error: 'No rows returned for any client, so the sheet was left untouched', failures },
      { status: 502 }
    );
  }

  const written = [];
  try {
    const combinedTab = config.combinedTab || 'All clients';
    await ensureTab({ spreadsheetId: config.spreadsheetId, tab: combinedTab });
    const c = await replaceTab({
      spreadsheetId: config.spreadsheetId,
      tab: combinedTab,
      rows: [HEADER, ...combined],
    });
    written.push({ tab: combinedTab, ...c });

    if (config.perClientTabs !== false) {
      for (const [name, rows] of byClient) {
        /* A client with no rows still gets a header-only tab rather than a
         * stale one full of last month's numbers. */
        const tab = safeTabName(name);
        await ensureTab({ spreadsheetId: config.spreadsheetId, tab });
        const w = await replaceTab({
          spreadsheetId: config.spreadsheetId,
          tab,
          rows: [HEADER, ...rows],
        });
        written.push({ tab, ...w });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err.message, written, failures }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    days,
    written,
    failures,
  });
}
