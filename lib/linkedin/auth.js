/**
 * LinkedIn OAuth, server side.
 *
 * Deliberately stateless: the long-lived refresh token lives in an env var,
 * and access tokens are cached in module memory for the life of a serverless
 * instance. That means a refresh every cold start, which is cheap and avoids
 * needing a database purely to hold one string.
 *
 * The /connect and /callback routes exist to obtain that refresh token once.
 * Paste the result into LINKEDIN_REFRESH_TOKEN and redeploy.
 */

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

export const SCOPES = ['r_ads', 'rw_ads', 'r_ads_reporting'];

/* Cached per serverless instance, not shared between them. */
let cache = { token: null, expiresAt: 0 };

export function config() {
  const c = {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI,
    refreshToken: process.env.LINKEDIN_REFRESH_TOKEN,
    apiVersion: process.env.LINKEDIN_API_VERSION || '202506',
  };
  return c;
}

export function authorizeUrl(state) {
  const c = config();
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId ?? '',
    redirect_uri: c.redirectUri ?? '',
    state,
    scope: SCOPES.join(' '),
  });
  return `${AUTH_URL}?${p}`;
}

export async function exchangeCode(code) {
  const c = config();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Returns a usable access token, refreshing if the cached one is near expiry. */
export async function getAccessToken() {
  const c = config();

  if (cache.token && Date.now() < cache.expiresAt - 60_000) return cache.token;

  if (!c.refreshToken) {
    throw new Error(
      'No LINKEDIN_REFRESH_TOKEN set. Visit /api/linkedin/connect to obtain one, then add it to the environment.'
    );
  }
  if (!c.clientId || !c.clientSecret) {
    throw new Error('LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be set.');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: c.refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Token refresh failed (${res.status}). The refresh token may have expired, so reconnect at /api/linkedin/connect.`
    );
  }
  const data = await res.json();
  cache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cache.token;
}
