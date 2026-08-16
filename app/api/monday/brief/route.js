import { NextResponse } from 'next/server';
import { createItem, briefToFields, isConfigured, mondayConfig } from '@/lib/monday';

export const dynamic = 'force-dynamic';

/** Whether the form should offer the Monday button at all. */
export async function GET() {
  const cfg = mondayConfig();
  return NextResponse.json({
    configured: isConfigured(),
    /* Never the token itself, only whether one is present. */
    hasToken: Boolean(cfg.token),
    hasBoard: Boolean(cfg.boardId),
  });
}

/** Writes one discovery brief to the Monday board as an item. */
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
      { ok: false, error: 'Add a client name before saving, because items without one are unfindable.' },
      { status: 400 }
    );
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Monday is not configured on this deployment. Set MONDAY_API_TOKEN and MONDAY_BOARD_ID (and MONDAY_GROUP_ID if the item should land in a particular group), then redeploy.',
      },
      { status: 501 }
    );
  }

  /* The item name is what shows in the board's first column, so it carries
   * both parts: one client runs several campaigns at once. */
  const name = [brief.client, brief.campaignName].filter(Boolean).join(' · ');

  try {
    const record = await createItem(name, briefToFields(brief, { flags: payload.flags }));
    return NextResponse.json({ ok: true, ...record });
  } catch (err) {
    /* Monday's own message names the column or permission it objected to,
     * so it goes back to the browser unchanged. It carries no credentials. */
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
