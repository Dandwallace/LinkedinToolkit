/**
 * Email sender.
 *
 * Resend rather than SMTP: no connection handling, works from a serverless
 * function without keeping a socket open, and the free tier covers a daily
 * brief many times over.
 *
 * Falls back to Slack if no email key is configured, so the brief still
 * arrives somewhere rather than silently not being sent.
 */

export async function sendBrief({ subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const to = (process.env.BRIEF_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  const from = process.env.BRIEF_FROM;

  if (key && to.length && from) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Resend ${res.status}: ${body.message || JSON.stringify(body).slice(0, 200)}`);
    }
    return { channel: 'email', to, id: body.id };
  }

  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `*${subject}*\n\`\`\`${text}\`\`\`` }),
    });
    return { channel: 'slack' };
  }

  throw new Error(
    'Nowhere to send the brief. Set RESEND_API_KEY, BRIEF_FROM and BRIEF_TO, or a SLACK_WEBHOOK_URL.'
  );
}
