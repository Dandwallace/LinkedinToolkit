import { NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/linkedin/auth';

export const dynamic = 'force-dynamic';

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

function page(inner, isError = false) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>LinkedIn connect</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#E8E6DD;margin:0;
    padding:40px 20px;color:#1B1D19}
  main{max-width:640px;margin:0 auto;background:#FCFCFA;border:1px solid #1B1D19;padding:28px}
  h1{font-size:19px;text-transform:uppercase;letter-spacing:.09em;margin:0 0 18px}
  p{font-size:14px;line-height:1.55;margin:0 0 12px}
  textarea{width:100%;height:110px;font-family:ui-monospace,SFMono-Regular,monospace;
    font-size:12px;border:1px solid #D6D4C8;padding:10px;background:#FBFAF6;resize:vertical}
  code{background:#F3F2EC;padding:1px 5px;font-size:13px}
  .note{font-size:12px;color:#5C5F57;margin-top:14px}
  .err{color:#A8342A}
</style>
<main><h1>${isError ? 'Connection failed' : 'Connected'}</h1>
<div class="${isError ? 'err' : ''}">${inner}</div></main>`,
    { status: isError ? 400 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/**
 * Step two. Shows the refresh token once so it can be pasted into the
 * environment. Nothing is written server-side — deliberately, so there is no
 * long-lived credential sitting in a database.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const expected = request.cookies.get('li_state')?.value;

  if (error) return page(`<p>LinkedIn returned: ${escapeHtml(error)}</p>`, true);
  if (!code) return page('<p>No authorisation code in the callback.</p>', true);
  if (!expected || state !== expected) {
    return page(
      '<p>State mismatch — possible CSRF. Start again from <code>/api/linkedin/connect</code>.</p>',
      true
    );
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      return page(
        `<p>LinkedIn did not return a refresh token. These are issued only to approved
         applications, so your access token will expire in around 60 days and you will
         need to reconnect manually.</p>`,
        true
      );
    }
    return page(
      `<p>Add this to your environment as <code>LINKEDIN_REFRESH_TOKEN</code>, then redeploy.</p>
       <textarea readonly onclick="this.select()">${escapeHtml(tokens.refresh_token)}</textarea>
       <p class="note">Shown once and stored nowhere. Treat it like a password —
       it grants write access to the ad account.</p>`
    );
  } catch (err) {
    return page(`<p>${escapeHtml(err.message)}</p>`, true);
  }
}
