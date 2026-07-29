import { NextResponse } from 'next/server';
import { getAnalytics, listCampaigns } from '@/lib/linkedin/client';

export const dynamic = 'force-dynamic';

/**
 * Returns analytics already flattened into the same row shape the CSV
 * analyser produces, so the live reporting page and the paste-a-CSV page can
 * share one rendering path rather than diverging.
 */
export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const accountId = p.get('account');
  const days = Math.min(365, Math.max(1, Number(p.get('days')) || 30));
  if (!accountId) return NextResponse.json({ error: 'account is required' }, { status: 400 });

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  try {
    const [rows, campaigns] = await Promise.all([
      getAnalytics({ accountId, start, end }),
      listCampaigns(accountId),
    ]);
    const nameById = new Map(campaigns.map((c) => [String(c.id), c.name]));

    const out = rows
      .map((r) => {
        const campaignId = (r.pivotValues?.[0] ?? '').split(':').pop() ?? '';
        const d = r.dateRange?.start;
        return {
          date: d
            ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
            : '',
          campaignId,
          campaign: nameById.get(campaignId) ?? '',
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          spend: Number(r.costInLocalCurrency ?? 0),
          conversions: Number(r.externalWebsiteConversions ?? 0),
          leads: Number(r.oneClickLeads ?? 0),
        };
      })
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ rows: out, days, account: accountId });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
