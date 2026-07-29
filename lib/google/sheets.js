import { createSign } from 'node:crypto';

/**
 * Google Sheets writer.
 *
 * Service account auth done by hand rather than pulling in googleapis, which
 * is a very large dependency for what amounts to one signed JWT.
 *
 * The key lives in an env var rather than a file, because Vercel's filesystem
 * is read-only and a service account key must never be committed. Paste the
 * whole downloaded JSON into GOOGLE_SERVICE_ACCOUNT_JSON.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const base64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* Cached per serverless instance. Tokens last an hour; cold starts refresh. */
let cache = { token: null, expiresAt: 0 };

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is not set. Create a service account in Google Cloud, ' +
        'enable the Sheets API, download the JSON key and paste it into that variable.'
    );
  }
  try {
    const key = JSON.parse(raw);
    if (!key.client_email || !key.private_key) {
      throw new Error('missing client_email or private_key');
    }
    return key;
  } catch (err) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON could not be parsed: ${err.message}`);
  }
}

async function accessToken() {
  if (cache.token && Date.now() < cache.expiresAt - 60_000) return cache.token;

  const key = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    })
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  /* Env vars flatten newlines, so restore them before signing. */
  const pem = key.private_key.replace(/\\n/g, '\n');
  const jwt = `${header}.${claims}.${base64url(signer.sign(pem))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  cache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cache.token;
}

async function call(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const res = await fetch(`${SHEETS_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        'Sheets refused the write (403). Share the spreadsheet with the service account email ' +
          'as an Editor — this is the step everyone misses.'
      );
    }
    if (text.includes('Unable to parse range')) {
      throw new Error('That tab does not exist in the spreadsheet. Create it, or check the name.');
    }
    throw new Error(`Sheets ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Replaces a tab's contents with `rows` (array of arrays, header first).
 *
 * Clear-then-write rather than append, deliberately: LinkedIn backdates
 * conversions as they arrive, so re-writing a rolling window corrects
 * yesterday's numbers. Append-only leaves permanently wrong recent history.
 */
export async function replaceTab({ spreadsheetId, tab, rows }) {
  const range = encodeURIComponent(`${tab}!A:Z`);
  await call(`/${spreadsheetId}/values/${range}:clear`, { method: 'POST' });
  const result = await call(`/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT',
    body: { values: rows },
  });
  return { rows: rows.length - 1, cells: result?.updatedCells ?? 0 };
}

/** Confirms credentials and access without writing anything. */
export async function checkAccess(spreadsheetId) {
  const meta = await call(`/${spreadsheetId}?fields=properties.title,sheets.properties.title`);
  return {
    title: meta?.properties?.title,
    tabs: (meta?.sheets ?? []).map((s) => s.properties.title),
    serviceAccount: credentials().client_email,
  };
}

/**
 * Creates a tab if it does not already exist.
 *
 * Needed because per-client tabs get added whenever a client is added to
 * config, and requiring someone to remember to create the tab by hand first
 * is the sort of step that gets forgotten and silently breaks a sync.
 */
export async function ensureTab({ spreadsheetId, tab }) {
  const meta = await call(`/${spreadsheetId}?fields=sheets.properties.title`);
  const existing = (meta?.sheets ?? []).map((s) => s.properties.title);
  if (existing.includes(tab)) return { created: false };

  await call(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: { requests: [{ addSheet: { properties: { title: tab } } }] },
  });
  return { created: true };
}

/**
 * Sheet tab names cannot contain : \ / ? * [ ] and are capped at 100 chars.
 * Client names come from config and will eventually contain something awkward.
 */
export function safeTabName(name) {
  return String(name || 'Unnamed')
    .replace(/[:\\/?*[\]]/g, '-')
    .trim()
    .slice(0, 90) || 'Unnamed';
}
