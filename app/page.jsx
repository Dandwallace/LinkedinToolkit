'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TOOLS, API_TOOLS } from '@/lib/tools';
import { CLIENTS, loadAllClients, flaggedAcrossClients } from '@/lib/client-store';
import ToolIcon from '@/components/ToolIcon';

/**
 * Dashboard.
 *
 * The client health blocks read from whatever has been uploaded on the CSV
 * analysis page and filed against a client, so this is empty on a fresh
 * browser. That is deliberate — an empty state that says where the data
 * comes from beats a demo one that looks like real numbers.
 */
export default function Home() {
  const [clients, setClients] = useState(() =>
    CLIENTS.map((c) => ({ ...c, data: null, counts: { healthy: 0, flagged: 0, paused: 0, total: 0 } }))
  );
  const [flagged, setFlagged] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      setClients(await loadAllClients());
      setFlagged(await flaggedAcrossClients());
      setReady(true);
    })();
  }, []);

  const anyData = clients.some((c) => c.data);

  return (
    <div className="index">
      <h1>LinkedIn Ads Toolkit</h1>
      <p className="index-sub">{TOOLS.length + API_TOOLS.length} tools</p>

      {/* ---------------- clients ---------------- */}
      <h2 className="index-group">Clients</h2>
      <div className="client-grid">
        {clients.map((c) => (
          <ClientCard key={c.id} client={c} ready={ready} />
        ))}
      </div>

      {/* ---------------- what needs attention ---------------- */}
      <h2 className="index-group">
        Needs looking at
        {flagged.length > 0 && <span className="group-count">{flagged.length}</span>}
      </h2>
      {!ready && <p className="attn-empty">Reading saved data…</p>}
      {ready && !anyData && (
        <p className="attn-empty">
          Nothing uploaded yet. Export a campaign performance report from Campaign Manager,
          drop it into <Link href="/performance">CSV analysis</Link>, and save it against a
          client — the flags appear here.
        </p>
      )}
      {ready && anyData && flagged.length === 0 && (
        <p className="attn-empty ok">
          Nothing flagged across the uploaded data. Every active campaign is delivering, inside
          the frequency ceiling, funded above the daily floor, and clearing 0.2% CTR.
        </p>
      )}
      {flagged.length > 0 && (
        <ul className="attn">
          {flagged.map((c) => (
            <li key={`${c.clientId}-${c.campaignId || c.name}`} className="attn-row">
              <div className="attn-head">
                <span className="attn-client">{c.client}</span>
                <span className="attn-name">{c.name}</span>
                <span className="attn-spend">£{Math.round(c.spend).toLocaleString('en-GB')}</span>
              </div>
              <ul className="attn-flags">
                {c.flags.map((f) => (
                  <li key={f.id} className={`attn-flag ${f.level}`}>
                    <span className="attn-flag-label">{f.label}</span>
                    {f.detail}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {/* ---------------- tools ---------------- */}
      <h2 className="index-group">Planning &amp; delivery</h2>
      <div className="index-grid">
        {TOOLS.map((t) => (
          <Link key={t.route} href={`/${t.route}`} className="card">
            <div className="card-top">
              <ToolIcon route={t.route} />
              <span className="card-form">{t.form}</span>
            </div>
            <div className="card-name">{t.name}</div>
            <div className="card-blurb">{t.blurb}</div>
          </Link>
        ))}
      </div>

      <h2 className="index-group">Connected to LinkedIn</h2>
      <div className="index-grid">
        {API_TOOLS.map((t) => (
          <Link key={t.route} href={`/${t.route}`} className="card api">
            <div className="card-top">
              <ToolIcon route={t.route} />
              <span className="card-form">{t.form}</span>
            </div>
            <div className="card-name">{t.name}</div>
            <div className="card-blurb">{t.blurb}</div>
          </Link>
        ))}
      </div>

      <div className="notice">
        <strong>Everything on the top row works today.</strong> Data lives in this browser
        only — nothing is sent anywhere.
        <br />
        <br />
        The connected tools need a LinkedIn developer app and the Advertising API product
        approved. Once you have credentials, visit <code>/api/linkedin/connect</code> once
        to obtain a refresh token. Until then those pages will tell you what is missing
        rather than failing silently.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ClientCard({ client, ready }) {
  const { counts, data } = client;
  const has = counts.total > 0;

  return (
    <section className="cl">
      <header className="cl-head">
        <h3 className="cl-name">{client.name}</h3>
        <span className="cl-total">
          {has ? `${counts.total} campaign${counts.total === 1 ? '' : 's'}` : '—'}
        </span>
      </header>

      <div className="cl-bar" role="img" aria-label={barLabel(counts)}>
        {has ? (
          <>
            {counts.healthy > 0 && (
              <span className="seg healthy" style={{ width: `${counts.pct.healthy}%` }} />
            )}
            {counts.flagged > 0 && (
              <span className="seg flagged" style={{ width: `${counts.pct.flagged}%` }} />
            )}
            {counts.paused > 0 && (
              <span className="seg paused" style={{ width: `${counts.pct.paused}%` }} />
            )}
          </>
        ) : (
          <span className="seg empty" />
        )}
      </div>

      <dl className="cl-counts">
        <div className="cl-count healthy">
          <dt>Healthy</dt>
          <dd>{has ? counts.healthy : '—'}</dd>
        </div>
        <div className="cl-count flagged">
          <dt>Flagged</dt>
          <dd>{has ? counts.flagged : '—'}</dd>
        </div>
        <div className="cl-count paused">
          <dt>Paused</dt>
          <dd>{has ? counts.paused : '—'}</dd>
        </div>
      </dl>

      <footer className="cl-foot">
        {data ? (
          <>
            {data.from && data.to ? `${data.from} to ${data.to}` : 'No dates in export'}
            {' · '}
            {data.granularity}
            {' · '}
            uploaded {new Date(data.savedAt).toLocaleDateString('en-GB')}
          </>
        ) : ready ? (
          <Link href="/performance">Upload an export</Link>
        ) : (
          'Loading…'
        )}
      </footer>
    </section>
  );
}

function barLabel(c) {
  if (!c.total) return 'No data uploaded';
  return `${c.healthy} healthy, ${c.flagged} flagged, ${c.paused} paused`;
}
