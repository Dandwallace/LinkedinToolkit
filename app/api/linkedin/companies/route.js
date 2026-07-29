import { NextResponse } from 'next/server';
import { getCompanyEngagement, resolveOrganizations } from '@/lib/linkedin/client';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const accountId = p.get('account');
  const days = Math.min(365, Math.max(1, Number(p.get('days')) || 30));
  if (!accountId) return NextResponse.json({ error: 'account is required' }, { status: 400 });

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  try {
    const rows = await getCompanyEngagement({ accountId, start, end });
    const names = await resolveOrganizations(rows.slice(0, 200).map((r) => r.organizationId));
    return NextResponse.json({
      days,
      resolvedNames: names.size,
      rows: rows.map((r) => ({ ...r, company: names.get(r.organizationId) || null })),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
