import { money } from '../health.js';

/**
 * Renders the morning brief.
 *
 * Table-based layout with inline styles throughout, because email clients
 * strip stylesheets, ignore flexbox and grid, and Outlook still renders
 * through Word. Nothing clever survives that, so nothing clever is used.
 *
 * Structure is deliberate: what needs attention comes first, numbers second.
 * A brief that opens with a wall of totals gets skimmed and then ignored.
 */

const INK = '#1b1d19';
const INK2 = '#5c5f57';
const CARBON = '#3a3f7a';
const RULE = '#d6d4c8';
const STAMP = '#a8342a';
const AMBER = '#b07a1e';
const OK = '#2f6b4f';
const PAPER = '#fcfcfa';
const BG = '#e8e6dd';

const LEVEL = {
  urgent: { colour: STAMP, label: 'Needs attention now', bg: '#f9ede9' },
  warn: { colour: AMBER, label: 'Worth a look', bg: '#f7efd9' },
  note: { colour: INK2, label: 'Noted', bg: '#f3f2ec' },
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const num = (n) => Math.round(n || 0).toLocaleString('en-GB');

function metricRow(label, value, sub) {
  return `
    <td style="padding:0 14px 0 0;vertical-align:top;">
      <div style="font:700 9px/1.2 Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;color:${INK2};padding-bottom:3px;">${esc(label)}</div>
      <div style="font:700 17px/1.2 'Courier New',monospace;color:${CARBON};">${esc(value)}</div>
      ${sub ? `<div style="font:400 10px/1.3 Arial,sans-serif;color:${INK2};padding-top:2px;">${esc(sub)}</div>` : ''}
    </td>`;
}

/** Week-on-week direction, worded so the reader does not have to work it out. */
function trend(current, previous, { lowerIsBetter = false, format = num } = {}) {
  if (!previous) return null;
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.05) return `level on last week`;
  const up = change > 0;
  const good = lowerIsBetter ? !up : up;
  const pct = Math.round(Math.abs(change) * 100);
  return `${up ? 'up' : 'down'} ${pct}% ${good ? '' : ''}on last week`.trim();
}

export function renderHtml({ accounts, siteUrl }) {
  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const allIssues = accounts.flatMap((a) => a.issues.map((i) => ({ ...i, client: a.client })));
  const urgent = allIssues.filter((i) => i.level === 'urgent');
  const others = allIssues.filter((i) => i.level !== 'urgent');

  const issueBlock = (issue) => `
    <tr>
      <td style="padding:0 0 8px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${LEVEL[issue.level].bg};border-left:3px solid ${LEVEL[issue.level].colour};">
          <tr><td style="padding:11px 14px;">
            <div style="font:700 9px/1.2 Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:${LEVEL[issue.level].colour};padding-bottom:4px;">${esc(issue.client)}</div>
            <div style="font:600 14px/1.35 Arial,sans-serif;color:${INK};padding-bottom:4px;">${esc(issue.title)}</div>
            <div style="font:400 12.5px/1.5 Arial,sans-serif;color:#4e4a33;">${esc(issue.detail)}</div>
          </td></tr>
        </table>
      </td>
    </tr>`;

  const accountBlock = (a) => {
    const w = a.week;
    const p = a.prior;
    return `
    <tr><td style="padding:0 0 2px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:${PAPER};border:1px solid ${RULE};">
        <tr><td style="padding:13px 16px 6px 16px;">
          <div style="font:700 14px/1.2 Arial,sans-serif;color:${INK};">${esc(a.client)}</div>
          <div style="font:400 11px/1.3 Arial,sans-serif;color:${INK2};padding-top:2px;">
            ${a.campaignCount} active campaign${a.campaignCount === 1 ? '' : 's'}${a.issues.length ? ` · ${a.issues.length} flagged` : ' · nothing flagged'}
          </div>
        </td></tr>
        <tr><td style="padding:6px 16px 14px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            ${metricRow('Yesterday', money(a.yesterday.spend))}
            ${metricRow('7-day spend', money(w.spend), trend(w.spend, p.spend))}
            ${metricRow('Leads', num(w.leads), trend(w.leads, p.leads))}
            ${w.leads ? metricRow('Cost per lead', money(w.cpl), trend(w.cpl, p.cpl, { lowerIsBetter: true })) : metricRow('Clicks', num(w.clicks), trend(w.clicks, p.clicks))}
            ${metricRow('CTR', w.ctr.toFixed(2) + '%', trend(w.ctr, p.ctr))}
          </tr></table>
        </td></tr>
      </table>
    </td></tr>`;
  };

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Campaign health</title></head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
<tr><td align="center" style="padding:22px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

  <tr><td style="background:${PAPER};border:1px solid ${INK};padding:18px 18px 16px 18px;">
    <div style="font:700 10px/1.2 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${CARBON};padding-bottom:5px;">LinkedIn Ads · Whitehart</div>
    <div style="font:700 22px/1.1 Arial,sans-serif;letter-spacing:-0.3px;color:${INK};">Campaign health</div>
    <div style="font:400 12px/1.4 'Courier New',monospace;color:${INK2};padding-top:5px;">${esc(date)}</div>
  </td></tr>

  ${allIssues.length === 0 ? `
  <tr><td style="padding:14px 0 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#eff3ed;border-left:3px solid ${OK};">
      <tr><td style="padding:14px 16px;">
        <div style="font:600 14px/1.4 Arial,sans-serif;color:#255740;">Nothing needs attention.</div>
        <div style="font:400 12.5px/1.5 Arial,sans-serif;color:#3d6b52;padding-top:4px;">
          Every active campaign delivered, pacing is within range, and no metric has moved enough to matter.
        </div>
      </td></tr>
    </table>
  </td></tr>` : ''}

  ${urgent.length ? `
  <tr><td style="padding:16px 0 6px 0;">
    <div style="font:700 10px/1.2 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${STAMP};">Needs attention now</div>
  </td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${urgent.map(issueBlock).join('')}
  </table></td></tr>` : ''}

  ${others.length ? `
  <tr><td style="padding:${urgent.length ? '10px' : '16px'} 0 6px 0;">
    <div style="font:700 10px/1.2 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${INK2};">Worth a look</div>
  </td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${others.map(issueBlock).join('')}
  </table></td></tr>` : ''}

  <tr><td style="padding:16px 0 6px 0;">
    <div style="font:700 10px/1.2 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${INK2};">Accounts</div>
  </td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${accounts.map(accountBlock).join('')}
  </table></td></tr>

  <tr><td style="padding:16px 0 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${PAPER};border:1px solid ${RULE};">
      <tr><td style="padding:13px 16px;">
        ${siteUrl ? `<a href="${esc(siteUrl)}/monitor" style="font:700 11px/1.2 Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;color:${PAPER};background:${CARBON};padding:9px 16px;text-decoration:none;display:inline-block;">Open the monitor</a>` : ''}
        <div style="font:400 10.5px/1.5 Arial,sans-serif;color:${INK2};padding-top:${siteUrl ? '11px' : '0'};">
          Figures cover the seven days to yesterday. LinkedIn backdates conversions as they arrive,
          so the most recent day or two will still move.
        </div>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Plain text alternative. Some clients prefer it, and it is what a watch shows. */
export function renderText({ accounts, siteUrl }) {
  const lines = [
    `CAMPAIGN HEALTH — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    '',
  ];

  const allIssues = accounts.flatMap((a) => a.issues.map((i) => ({ ...i, client: a.client })));
  if (!allIssues.length) {
    lines.push('Nothing needs attention. Every active campaign delivered and pacing is within range.', '');
  } else {
    for (const level of ['urgent', 'warn', 'note']) {
      const group = allIssues.filter((i) => i.level === level);
      if (!group.length) continue;
      lines.push(LEVEL[level].label.toUpperCase());
      for (const i of group) lines.push(`  ${i.client}: ${i.title}`, `    ${i.detail}`);
      lines.push('');
    }
  }

  lines.push('ACCOUNTS');
  for (const a of accounts) {
    lines.push(
      `  ${a.client} — ${a.campaignCount} active`,
      `    Yesterday ${money(a.yesterday.spend)} · 7-day ${money(a.week.spend)}` +
        ` · ${num(a.week.leads)} leads${a.week.leads ? ` at ${money(a.week.cpl)}` : ''}` +
        ` · CTR ${a.week.ctr.toFixed(2)}%`
    );
  }

  if (siteUrl) lines.push('', `Monitor: ${siteUrl}/monitor`);
  lines.push('', 'Figures cover the seven days to yesterday. Recent days still move as LinkedIn backdates conversions.');
  return lines.join('\n');
}
