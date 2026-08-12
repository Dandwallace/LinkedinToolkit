import { NextResponse } from 'next/server';
import { getAnalytics } from '@/lib/linkedin/client';
import caps from '@/config/budgets.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Spend alarm. Runs daily and compares month-to-date spend against each
 * account's cap, pro-rated for how far through the month we are.
 *
 * The pro-rating is the point: £6,000 spent by the 20th of a 30-day month is
 * fine against a £9,000 cap, and alarming against a £7,000 one. A flat
 * "have we exceeded the cap" check only fires once the money is already gone.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  const accounts = caps.accounts ?? [];
  if (!accounts.length) {
    return NextResponse.json({ ok: true, message: 'No budgets configured in config/budgets.json' });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const monthElapsed = dayOfMonth / daysInMonth;

  const results = [];

  for (const acc of accounts) {
    try {
      const rows = await getAnalytics({ accountId: acc.accountId, start: monthStart, end: now });
      const spend = rows.reduce((n, r) => n + Number(r.costInLocalCurrency ?? 0), 0);
      const cap = Number(acc.monthlyCap) || 0;
      if (!cap) continue;

      const expected = cap * monthElapsed;
      const pace = expected ? spend / expected : 0;
      const projected = monthElapsed ? spend / monthElapsed : 0;
      const tolerance = Number(acc.tolerance ?? 0.15);

      let level = 'ok';
      if (pace > 1 + tolerance) level = 'over';
      else if (pace < 1 - tolerance) level = 'under';

      results.push({
        accountId: acc.accountId,
        label: acc.label || acc.accountId,
        cap,
        spend: Number(spend.toFixed(2)),
        expectedByNow: Number(expected.toFixed(2)),
        projectedMonth: Number(projected.toFixed(2)),
        pace: Number(pace.toFixed(3)),
        level,
        message:
          level === 'over'
            ? `Pacing ${Math.round((pace - 1) * 100)}% hot, on track for ${Math.round(projected)} against a ${cap} cap.`
            : level === 'under'
              ? `Pacing ${Math.round((1 - pace) * 100)}% cold, on track for ${Math.round(projected)} against a ${cap} cap.`
              : 'On pace.',
      });
    } catch (err) {
      results.push({ accountId: acc.accountId, level: 'error', message: err.message });
    }
  }

  const alerts = results.filter((r) => r.level === 'over' || r.level === 'error');

  /* Slack is optional. Without a webhook this endpoint is still useful —
   * the monitor page reads the same numbers on demand. */
  if (alerts.length && process.env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:
            `*LinkedIn spend alarm*, day ${dayOfMonth} of ${daysInMonth}\n` +
            alerts.map((a) => `• ${a.label}: ${a.message}`).join('\n'),
        }),
      });
    } catch {
      /* A failed notification must not fail the check itself. */
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    dayOfMonth,
    daysInMonth,
    monthElapsed: Number(monthElapsed.toFixed(3)),
    alerts: alerts.length,
    notified: Boolean(alerts.length && process.env.SLACK_WEBHOOK_URL),
    results,
  });
}
