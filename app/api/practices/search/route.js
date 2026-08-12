import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Searches for LinkedIn Ads best practice published since a given date.
 *
 * Runs server-side because it needs an API key. Returns candidate entries
 * for the page to show ABOVE the curated list; nothing here ever edits or
 * replaces an existing entry, because a model that rewrites a fact you are
 * quoting to a client is worse than a stale date.
 *
 * Everything comes back marked unverified, with its source URL, so what
 * lands on the page is a prompt to go and read the source rather than a
 * claim the toolkit is making.
 */

const MODEL = 'claude-sonnet-5';
const API = 'https://api.anthropic.com/v1/messages';

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Searching needs an Anthropic API key. Set ANTHROPIC_API_KEY in the environment and redeploy. Until then the curated entries below are unaffected.',
      },
      { status: 501 }
    );
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    /* body is optional */
  }
  const since = String(payload.since || '').slice(0, 10) || '2026-01-01';
  const known = Array.isArray(payload.known) ? payload.known.slice(0, 80) : [];

  const prompt = [
    `Search the web for changes to LinkedIn advertising that a B2B media team would need to know about, published since ${since}.`,
    '',
    'Rules:',
    '- Only report things you found a source for. Every item needs a real URL you retrieved.',
    '- Prefer LinkedIn\'s own help and business pages. Mark anything else as industry practice.',
    '- Do not restate things already covered by this list of existing headlines:',
    known.map((k) => `  - ${k}`).join('\n'),
    '',
    'Return STRICT JSON only, no prose, in this shape:',
    '{"entries":[{"headline":"short number or rule","practice":"one sentence","why":"why it matters","category":"Budget & structure|Audience|Creative & formats|Measurement|Timing & duration|Cost benchmarks|Platform traps","source":{"name":"publisher and title","url":"https://...","type":"official|industry|vendor"},"published":"YYYY-MM-DD or empty"}]}',
    'If nothing has changed, return {"entries":[]}.',
  ].join('\n');

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error?.message || `Search failed (${res.status})` },
        { status: 502 }
      );
    }

    /* The reply interleaves tool use and text; the JSON is in the text. */
    const text = (data.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { ok: false, error: 'The search returned nothing that could be read as entries.' },
        { status: 502 }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'The search returned malformed JSON.' },
        { status: 502 }
      );
    }

    /* Anything without a real source URL is dropped. An unsourced claim is
     * exactly what this page exists to avoid. */
    const entries = (parsed.entries || [])
      .filter((e) => e?.headline && e?.source?.url?.startsWith('http'))
      .slice(0, 12)
      .map((e, i) => ({
        id: `found-${Date.now()}-${i}`,
        headline: String(e.headline).slice(0, 90),
        practice: String(e.practice || '').slice(0, 400),
        why: String(e.why || '').slice(0, 600),
        category: String(e.category || 'Platform traps'),
        source: {
          name: String(e.source.name || 'Search result').slice(0, 160),
          url: String(e.source.url),
          type: ['official', 'industry', 'vendor'].includes(e.source.type) ? e.source.type : 'industry',
        },
        published: String(e.published || '').slice(0, 10),
        found: new Date().toISOString().slice(0, 10),
        unverified: true,
      }));

    return NextResponse.json({ ok: true, entries, searchedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
