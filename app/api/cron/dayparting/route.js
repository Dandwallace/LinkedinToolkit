import { NextResponse } from 'next/server';
import { listCampaigns, setCampaignStatus } from '@/lib/linkedin/client';
import { resolveDesiredStates, validateConfig } from '@/lib/linkedin/schedule';
import schedules from '@/config/schedules.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Dayparting run. Triggered by Vercel Cron every 15 minutes (see vercel.json).
 *
 * Only writes when a campaign's actual status differs from what the schedule
 * says it should be, so a normal run costs a couple of read calls and nothing
 * else. Campaigns in any state other than ACTIVE or PAUSED are left alone —
 * if a human archived something, this must not override that.
 *
 * Add ?dry=1 to preview without sending anything.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';

  /* Vercel Cron sends this header; a manual browser visit will not. */
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  const errors = validateConfig(schedules);
  if (errors.length) {
    return NextResponse.json({ error: 'Invalid schedule config', errors }, { status: 500 });
  }

  const desired = resolveDesiredStates(schedules);
  if (!desired.length) {
    return NextResponse.json({ ok: true, message: 'No enabled schedules', changed: 0 });
  }

  const log = [];
  let changed = 0;
  let alreadyCorrect = 0;
  let skipped = 0;

  try {
    /* One read per account rather than one per campaign. */
    const accountIds = [...new Set(desired.map((d) => d.accountId))];
    const current = new Map();
    for (const accountId of accountIds) {
      for (const c of await listCampaigns(accountId)) {
        current.set(`${accountId}:${c.id}`, { status: c.status, name: c.name });
      }
    }

    for (const item of desired) {
      const found = current.get(`${item.accountId}:${item.campaignId}`);
      if (!found) {
        skipped++;
        log.push({ campaignId: item.campaignId, action: 'not found in account' });
        continue;
      }
      if (!['ACTIVE', 'PAUSED'].includes(found.status)) {
        skipped++;
        log.push({ campaign: found.name, action: `left alone (${found.status})` });
        continue;
      }
      if (found.status === item.desired) {
        alreadyCorrect++;
        continue;
      }
      if (!dryRun) {
        await setCampaignStatus(item.accountId, item.campaignId, item.desired);
      }
      changed++;
      log.push({
        campaign: found.name,
        campaignId: item.campaignId,
        from: found.status,
        to: item.desired,
        rule: item.label,
        timezone: item.timezone,
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      ranAt: new Date().toISOString(),
      changed,
      alreadyCorrect,
      skipped,
      log,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message, partialLog: log }, { status: 502 });
  }
}
