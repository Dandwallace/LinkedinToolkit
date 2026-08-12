import { NextResponse } from 'next/server';
import { getAnalytics, listCampaigns } from '@/lib/linkedin/client';
import { assessAccount, subjectFor } from '@/lib/health';
import { renderHtml, renderText } from '@/lib/email/render';
import { sendBrief } from '@/lib/email/send';
import clients from '@/config/clients.json';
import budgets from '@/config/budgets.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Morning brief. Runs daily, after the Sheets sync.
 *
 * Add ?preview=1 to render without sending — useful for seeing what a real
 * morning would look like before trusting it to arrive at 07:00.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const preview = url.searchParams.get('preview') === '1';

  const secret = process.env.CRON_SECRET;
  if (secret && !preview) {
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  const enabled = (clients.clients ?? []).filter((c) => c.enabled !== false && c.accountId);
  if (!enabled.length) {
    return NextResponse.json({ ok: true, message: 'No enabled clients in config/clients.json' });
  }

  const capByAccount = new Map(
    (budgets.accounts ?? []).map((a) => [String(a.accountId), Number(a.monthlyCap) || 0])
  );

  const now = new Date();
  const start = new Date(now.getTime() - 31 * 86400000);
  const accounts = [];
  const failures = [];

  for (const client of enabled) {
    try {
      const [analytics, campaigns] = await Promise.all([
        getAnalytics({ accountId: client.accountId, start, end: now }),
        listCampaigns(client.accountId),
      ]);

      const rows = analytics
        .map((r) => {
          const d = r.dateRange?.start;
          if (!d) return null;
          return {
            date: `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
            campaignId: (r.pivotValues?.[0] ?? '').split(':').pop() ?? '',
            impressions: Number(r.impressions ?? 0),
            clicks: Number(r.clicks ?? 0),
            spend: Number(r.costInLocalCurrency ?? 0),
            conversions: Number(r.externalWebsiteConversions ?? 0),
            leads: Number(r.oneClickLeads ?? 0),
          };
        })
        .filter(Boolean);

      accounts.push(
        assessAccount({
          client: client.name,
          rows,
          campaigns,
          monthlyCap: capByAccount.get(String(client.accountId)) || 0,
          now,
        })
      );
    } catch (err) {
      failures.push({ client: client.name, error: err.message });
    }
  }

  if (!accounts.length) {
    return NextResponse.json({ error: 'Every account failed, nothing sent', failures }, { status: 502 });
  }

  const siteUrl = process.env.SITE_URL || '';
  const subject = subjectFor(accounts);
  const html = renderHtml({ accounts, siteUrl });
  const text = renderText({ accounts, siteUrl });

  if (preview) {
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  try {
    const sent = await sendBrief({ subject, html, text });
    return NextResponse.json({ ok: true, subject, accounts: accounts.length, ...sent, failures });
  } catch (err) {
    return NextResponse.json({ error: err.message, subject, failures }, { status: 502 });
  }
}
