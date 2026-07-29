import { NextResponse } from 'next/server';
import { listAdAccounts } from '@/lib/linkedin/client';
import { checkAccess } from '@/lib/google/sheets';
import clients from '@/config/clients.json';
import budgets from '@/config/budgets.json';
import schedules from '@/config/schedules.json';

export const dynamic = 'force-dynamic';

/**
 * Setup status.
 *
 * Reports what is actually configured rather than what should be. Each block
 * separates "the credential exists" from "the credential works" — the two
 * fail very differently, and knowing which one you have saves an afternoon.
 */
export async function GET() {
  const out = {};

  /* ---- LinkedIn ---- */
  const li = {
    clientId: Boolean(process.env.LINKEDIN_CLIENT_ID),
    clientSecret: Boolean(process.env.LINKEDIN_CLIENT_SECRET),
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || null,
    refreshToken: Boolean(process.env.LINKEDIN_REFRESH_TOKEN),
    apiVersion: process.env.LINKEDIN_API_VERSION || '202506',
    connected: false,
    accounts: [],
    error: null,
  };
  if (li.clientId && li.clientSecret && li.refreshToken) {
    try {
      li.accounts = await listAdAccounts();
      li.connected = true;
    } catch (err) {
      li.error = err.message;
    }
  }
  out.linkedin = li;

  /* ---- Google Sheets ---- */
  const g = {
    credentials: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    spreadsheetId: Boolean(clients.spreadsheetId),
    connected: false,
    serviceAccount: null,
    title: null,
    tabs: [],
    error: null,
  };
  if (g.credentials && g.spreadsheetId) {
    try {
      const info = await checkAccess(clients.spreadsheetId);
      Object.assign(g, info, { connected: true });
    } catch (err) {
      g.error = err.message;
      /* Surface the service account address even on failure — it is what
       * needs sharing, and it is the commonest reason for a 403. */
      try {
        g.serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email;
      } catch { /* unparseable key; the error already says so */ }
    }
  } else if (g.credentials) {
    try {
      g.serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email;
    } catch { /* ignore */ }
  }
  out.google = g;

  /* ---- config files ---- */
  out.config = {
    clients: (clients.clients ?? []).filter((c) => c.enabled !== false && c.accountId).length,
    clientsTotal: (clients.clients ?? []).length,
    budgets: (budgets.accounts ?? []).filter((a) => a.monthlyCap).length,
    schedules: (schedules.schedules ?? []).filter((s) => s.enabled !== false).length,
  };

  /* ---- delivery ---- */
  out.delivery = {
    cronSecret: Boolean(process.env.CRON_SECRET),
    siteUrl: process.env.SITE_URL || null,
    resend: Boolean(process.env.RESEND_API_KEY && process.env.BRIEF_FROM && process.env.BRIEF_TO),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
  };

  return NextResponse.json(out);
}
