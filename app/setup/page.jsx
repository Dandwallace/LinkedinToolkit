'use client';

import { useEffect, useState } from 'react';

/**
 * Setup status page.
 *
 * Ordered by dependency, not by effort. The LinkedIn application goes first
 * because approval takes weeks and everything downstream of it waits — the
 * rest can be done while it is pending.
 */

const STEPS = [
  {
    id: 'app',
    title: 'Register the LinkedIn developer app',
    wait: 'Approval takes weeks, so start here',
    body: 'Create an app at developer.linkedin.com against the Whitehart Company Page, then request the Advertising API product. Development tier is enough: write access for up to five ad accounts, unlimited reads.',
    manual: true,
    detail: [
      'Add this exact redirect URL under the Auth tab:',
      '{SITE}/api/linkedin/callback',
    ],
  },
  {
    id: 'deploy',
    title: 'Deploy the site',
    body: 'Push to GitHub, import the repository in Vercel. Twelve tools work immediately with no credentials at all.',
    manual: true,
  },
  {
    id: 'linkedin',
    title: 'Connect LinkedIn',
    body: 'Once the app is approved: add the client ID and secret, visit /api/linkedin/connect to get a refresh token, paste it in and redeploy.',
    check: (s) => ({
      done: s.linkedin.connected,
      partial: s.linkedin.clientId && !s.linkedin.connected,
      note: s.linkedin.connected
        ? `${s.linkedin.accounts.length} ad account${s.linkedin.accounts.length === 1 ? '' : 's'} visible`
        : s.linkedin.error
          ? s.linkedin.error
          : !s.linkedin.clientId
            ? 'No client ID set'
            : !s.linkedin.refreshToken
              ? 'Credentials set. Visit /api/linkedin/connect to finish'
              : null,
    }),
  },
  {
    id: 'google',
    title: 'Connect Google Sheets',
    body: 'Create a Google Cloud project, enable the Sheets API, make a service account, and paste its JSON key into GOOGLE_SERVICE_ACCOUNT_JSON. Then share the spreadsheet with the service account address as an Editor.',
    check: (s) => ({
      done: s.google.connected,
      partial: s.google.credentials && !s.google.connected,
      note: s.google.connected
        ? `${s.google.title} · ${s.google.tabs.length} tab${s.google.tabs.length === 1 ? '' : 's'}`
        : s.google.error
          ? s.google.error
          : !s.google.credentials
            ? 'No service account key set'
            : 'Key set. Add spreadsheetId to config/clients.json',
      extra: s.google.serviceAccount
        ? `Share the sheet with: ${s.google.serviceAccount}`
        : null,
    }),
  },
  {
    id: 'clients',
    title: 'List the clients',
    body: 'Add each account to config/clients.json with a name and LinkedIn account ID, and set the spreadsheetId. This drives the Sheets sync and the morning brief.',
    check: (s) => ({
      done: s.config.clients > 0,
      note: s.config.clients
        ? `${s.config.clients} enabled of ${s.config.clientsTotal}`
        : 'None enabled yet',
    }),
  },
  {
    id: 'brief',
    title: 'Somewhere to send the morning brief',
    body: 'A Resend API key with BRIEF_FROM and BRIEF_TO, or a Slack webhook. Without either, the brief has nowhere to go.',
    check: (s) => ({
      done: s.delivery.resend || s.delivery.slack,
      note: s.delivery.resend ? 'Email configured' : s.delivery.slack ? 'Slack configured' : 'Nowhere to send',
    }),
  },
  {
    id: 'cron',
    title: 'Protect the scheduled jobs',
    body: 'Set CRON_SECRET to any random string, and add the same value plus SITE_URL as GitHub repository secrets so the dayparting workflow can authenticate.',
    check: (s) => ({
      done: s.delivery.cronSecret,
      note: s.delivery.cronSecret
        ? s.delivery.siteUrl ? 'Set' : 'Set, but SITE_URL is still missing'
        : 'Not set. The endpoints are open to anyone who finds the URL.',
    }),
  },
  {
    id: 'budgets',
    title: 'Monthly budget caps',
    body: 'Optional but worth it. Add each account to config/budgets.json to enable pacing alerts in the morning brief and the monitor.',
    check: (s) => ({
      done: s.config.budgets > 0,
      optional: true,
      note: s.config.budgets ? `${s.config.budgets} configured` : 'None set, so pacing checks will be skipped',
    }),
  },
  {
    id: 'dayparting',
    title: 'Dayparting schedule',
    body: 'Optional. Build rules on the Dayparting page, then commit the JSON to config/schedules.json.',
    check: (s) => ({
      done: s.config.schedules > 0,
      optional: true,
      note: s.config.schedules ? `${s.config.schedules} rule(s)` : 'None yet',
    }),
  },
  {
    id: 'airtable',
    title: 'Finish the Airtable bases',
    body: 'Add three link fields by hand: QA Checks to Launches, QA Checks to QA Template, Creatives to Briefs. Then one automation on Launches: when a record is created, create a QA Check for every Template record.',
    manual: true,
  },
];

export default function SetupPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/setup/status');
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not read status'); }
      else { setStatus(d); setError(null); }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const resolved = STEPS.map((s) => {
    if (s.manual || !status) return { ...s, state: s.manual ? 'manual' : 'unknown' };
    const r = s.check(status);
    return { ...s, ...r, state: r.done ? 'done' : r.partial ? 'partial' : r.optional ? 'optional' : 'todo' };
  });

  const checkable = resolved.filter((s) => !s.manual);
  const done = checkable.filter((s) => s.state === 'done').length;
  const required = checkable.filter((s) => !s.optional);
  const requiredDone = required.filter((s) => s.state === 'done').length;

  return (
    <div className="sheet">
      <header className="masthead">
        <div>
          <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
          <h1 className="mast-title">Setup</h1>
          <div className="linked">
            {status
              ? `${requiredDone} of ${required.length} essentials connected`
              : loading ? 'Checking…' : 'Status unavailable'}
          </div>
        </div>
        <button type="button" className="btn ghost" onClick={load} disabled={loading}>
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </header>

      {error && <div className="su-alert">{error}</div>}

      <div className="su-body">
        <p className="su-intro">
          Ordered by dependency, not effort. The first step has a multi-week approval, so it goes
          first and everything else happens while it is pending. Twelve of the sixteen tools work
          before any of this is done.
        </p>

        {resolved.map((s, i) => (
          <section className={`su-step ${s.state}`} key={s.id}>
            <div className="su-num">{i + 1}</div>
            <div className="su-main">
              <div className="su-top">
                <span className="su-title">{s.title}</span>
                <span className={`su-badge ${s.state}`}>
                  {s.state === 'done' ? 'Connected'
                    : s.state === 'partial' ? 'Half done'
                    : s.state === 'manual' ? 'Do by hand'
                    : s.state === 'optional' ? 'Optional'
                    : s.state === 'unknown' ? 'Unknown' : 'To do'}
                </span>
              </div>
              <p className="su-body-text">{s.body}</p>
              {s.wait && <p className="su-wait">{s.wait}</p>}
              {s.detail && (
                <div className="su-detail">
                  {s.detail.map((d, j) => (
                    <div key={j} className={d.includes('{SITE}') ? 'su-code' : ''}>
                      {d.replace('{SITE}', origin || 'https://your-site.vercel.app')}
                    </div>
                  ))}
                </div>
              )}
              {s.note && <p className={`su-note ${s.state}`}>{s.note}</p>}
              {s.extra && <p className="su-extra">{s.extra}</p>}
            </div>
          </section>
        ))}

        <div className="su-foot">
          <div className="su-foot-head">Check as you go</div>
          <ul>
            <li><code>/api/linkedin/connect</code>, obtains the refresh token, once</li>
            <li><code>/api/google/check</code>, confirms Sheets access and lists visible tabs</li>
            <li><code>/api/cron/sync-sheets?dry=1</code>, counts rows without writing</li>
            <li><code>/api/cron/dayparting?dry=1</code>, previews schedule changes and sends nothing</li>
            <li><code>/api/cron/morning-brief?preview=1</code>, renders the real email in the browser</li>
          </ul>
          <p className="su-foot-note">
            Every one of these is safe to run. Nothing in this list changes a campaign or sends
            anything.
          </p>
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.su-alert{max-width:900px;margin:0 auto;background:#F9EDE9;border-left:1px solid var(--ink);
  border-right:1px solid var(--ink);padding:11px 22px;font-size:13px;color:#7A3B22;}
.su-body{max-width:900px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-top:none;padding:0 0 4px 0;}
.su-intro{margin:0;padding:14px 22px 16px;font-size:12.5px;line-height:1.6;color:var(--ink-2);
  border-bottom:1px solid var(--rule);}

.su-step{display:grid;grid-template-columns:auto 1fr;gap:14px;padding:14px 22px;
  border-bottom:1px solid var(--rule);}
.su-step:last-of-type{border-bottom:none;}
.su-step.done{background:#F6F9F5;}
.su-step.partial{background:#FCF8EE;}
.su-num{width:22px;height:22px;flex:none;display:grid;place-items:center;
  background:var(--rule);color:var(--ink);font-family:'Courier Prime',monospace;
  font-size:12px;font-weight:700;}
.su-step.done .su-num{background:var(--ok);color:#fff;}
.su-step.partial .su-num{background:var(--amber);color:#fff;}
.su-step.manual .su-num{background:var(--carbon);color:#fff;}

.su-top{display:flex;align-items:baseline;gap:10px;justify-content:space-between;margin-bottom:4px;}
.su-title{font-size:14px;font-weight:600;}
.su-badge{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.15em;text-transform:uppercase;padding:2px 7px;border:1px solid var(--rule);
  color:var(--ink-2);white-space:nowrap;flex:none;}
.su-badge.done{border-color:var(--ok);color:var(--ok);}
.su-badge.partial{border-color:var(--amber);color:var(--amber);}
.su-badge.manual{border-color:var(--carbon);color:var(--carbon);}
.su-badge.todo{border-color:var(--stamp);color:var(--stamp);}

.su-body-text{margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-2);}
.su-wait{margin:5px 0 0;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.13em;text-transform:uppercase;color:var(--stamp);}
.su-detail{margin-top:7px;font-size:11.5px;line-height:1.6;color:var(--ink-2);}
.su-code{font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--carbon);
  background:#F3F2EC;padding:4px 8px;margin-top:3px;word-break:break-all;}
.su-note{margin:6px 0 0;font-family:'Courier Prime',monospace;font-size:11.5px;
  color:var(--ink-2);word-break:break-word;}
.su-note.done{color:var(--ok);}
.su-note.todo{color:var(--stamp);}
.su-note.partial{color:var(--amber);}
.su-extra{margin:4px 0 0;font-family:'Courier Prime',monospace;font-size:11px;
  color:var(--carbon);background:#F3F2EC;padding:5px 8px;word-break:break-all;}

.su-foot{background:#F3F2EC;border-top:1px solid var(--ink);padding:14px 22px 16px;}
.su-foot-head{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);margin-bottom:8px;}
.su-foot ul{margin:0;padding-left:16px;}
.su-foot li{font-size:12px;line-height:1.75;color:var(--ink-2);}
.su-foot code{font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--carbon);
  background:var(--white);padding:1px 5px;}
.su-foot-note{margin:9px 0 0;font-size:11px;line-height:1.5;color:var(--ink-2);}

@media (max-width:640px){
  .su-step{padding:12px 14px;gap:10px;}
  .su-intro,.su-foot{padding-left:14px;padding-right:14px;}
  .su-top{flex-wrap:wrap;}
}
`;
