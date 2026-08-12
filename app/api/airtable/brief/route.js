import { NextResponse } from 'next/server';
import { createRecord, briefToFields, isConfigured, airtableConfig } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

/** Whether the form should offer the Airtable button at all. */
export async function GET() {
  const cfg = airtableConfig();
  return NextResponse.json({
    configured: isConfigured(),
    table: cfg.table,
    /* Never the token itself — only whether one is present. */
    hasToken: Boolean(cfg.token),
    hasBase: Boolean(cfg.baseId),
  });
}

/** Writes one discovery brief to the Briefs table. */
export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
  }

  const brief = payload?.brief;
  if (!brief || typeof brief !== 'object') {
    return NextResponse.json({ ok: false, error: 'No brief in the request body.' }, { status: 400 });
  }
  if (!String(brief.client || '').trim()) {
    return NextResponse.json(
      { ok: false, error: 'Add a client name before saving, because Airtable records without one are unfindable.' },
      { status: 400 }
    );
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Airtable is not configured on this deployment. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID (and AIRTABLE_BRIEFS_TABLE if the table is not called "Briefs").',
      },
      { status: 501 }
    );
  }

  try {
    const record = await createRecord(briefToFields(brief, { flags: payload.flags }));
    return NextResponse.json({ ok: true, ...record });
  } catch (err) {
    /* Airtable's own message names the offending field, so it goes back to
     * the browser unchanged. It carries no credentials. */
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
