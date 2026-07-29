import { NextResponse } from 'next/server';
import { listAdAccounts } from '@/lib/linkedin/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ accounts: await listAdAccounts() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
