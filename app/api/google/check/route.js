import { NextResponse } from 'next/server';
import { checkAccess } from '@/lib/google/sheets';
import clients from '@/config/clients.json';

export const dynamic = 'force-dynamic';

/** Confirms the service account works and the sheet is shared, without writing. */
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('sheet') || clients.spreadsheetId;
  if (!id) {
    return NextResponse.json(
      { error: 'No spreadsheetId. Set it in config/clients.json or pass ?sheet=…' },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json({ ok: true, ...(await checkAccess(id)) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
