import { NextResponse } from 'next/server';
import { authorizeUrl, config } from '@/lib/linkedin/auth';

export const dynamic = 'force-dynamic';

/** Step one of obtaining a refresh token. Visit this in a browser. */
export async function GET() {
  const c = config();
  if (!c.clientId || !c.redirectUri) {
    return NextResponse.json(
      { error: 'Set LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI first.' },
      { status: 500 }
    );
  }
  const state = Math.random().toString(36).slice(2);
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set('li_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600 });
  return res;
}
