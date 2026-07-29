import { NextResponse } from 'next/server';
import { listCampaigns } from '@/lib/linkedin/client';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const accountId = new URL(request.url).searchParams.get('account');
  if (!accountId) return NextResponse.json({ error: 'account is required' }, { status: 400 });
  try {
    return NextResponse.json({ campaigns: await listCampaigns(accountId) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
