import { NextResponse } from 'next/server';
import { getReachAndFrequency, listCampaigns } from '@/lib/linkedin/client';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const accountId = p.get('account');
  const days = Math.min(92, Math.max(1, Number(p.get('days')) || 30));
  if (!accountId) return NextResponse.json({ error: 'account is required' }, { status: 400 });

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  try {
    const [result, campaigns] = await Promise.all([
      getReachAndFrequency({ accountId, start, end }),
      listCampaigns(accountId),
    ]);
    if (result.unavailable) return NextResponse.json(result);

    const nameById = new Map(campaigns.map((c) => [String(c.id), c.name]));
    const budgetById = new Map(campaigns.map((c) => [String(c.id), c.dailyBudget]));
    return NextResponse.json({
      days,
      rows: result.rows.map((r) => ({
        ...r,
        campaign: nameById.get(r.campaignId) ?? r.campaignId,
        dailyBudget: budgetById.get(r.campaignId) ?? null,
      })).sort((a, b) => b.spend - a.spend),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
