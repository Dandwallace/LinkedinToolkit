'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TOOLS, API_TOOLS } from '@/lib/tools';
import {
  CLIENTS,
  STATES,
  loadAllClients,
  flaggedAcrossClients,
  activeByGroup,
} from '@/lib/client-store';
import ToolIcon from '@/components/ToolIcon';

/**
 * Dashboard.
 *
 * The client health blocks read from whatever has been uploaded on the
 * reporting page and filed against a client, so this is empty on a fresh
 * browser. That is deliberate: an empty state that says where the data
 * comes from beats a demo one that looks like real numbers.
 */

const STATE_LABEL = {
  healthy: 'Healthy',
  flagged: 'Flagged',
  paused: 'Paused',
  building: 'Building',
  complete: 'Complete',
};

const emptyCounts = () => ({
  ...Object.fromEntries(STATES.map((s) => [s, 0])),
  total: 0,
  pct: Object.fromEntries(STATES.map((s) => [s, 0])),
});

export default function Home() {
  const [clients, setClients] = useState(() =>
    CLIENTS.map((c) => ({ ...c, data: null, counts: emptyCounts() }))
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
          drop it into <Link href="/reporting">Reporting</Link>, and save it against a client.
          The flags appear here.
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
                <span className="attn-spend">${Math.round(c.spend).toLocaleString('en-GB')}</span>
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
  const [open, setOpen] = useState(false);
  const { counts, data } = client;
  const has = counts.total > 0;
  const labels = data?.labels || { group: 'Campaign', unit: 'Ad Set' };
  const groupCounts = data?.groupCounts;
  const groups = activeByGroup(data);
  const activeCount = groups.reduce((n, g) => n + g.campaigns.length, 0);

  return (
    <section className="cl">
      <header className="cl-head">
        <img
          className="cl-logo"
          src={`/logos/${client.id}.png`}
          alt=""
          width={96}
          height={24}
        />
        <h3 className="cl-name">{client.name}</h3>
      </header>

      {/* group level */}
      {groupCounts?.total > 0 && (
        <Level label={labels.group} counts={groupCounts} />
      )}

      {/* unit level */}
      <Level label={has ? labels.unit : 'Campaigns'} counts={counts} />

      {activeCount > 0 && (
        <div className="cl-active">
          <button
            type="button"
            className="cl-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? '−' : '+'} {activeCount} active {activeCount === 1 ? 'campaign' : 'campaigns'}
          </button>
          {open && (
            <div className="cl-groups">
              {groups.map((g) => (
                <div className="cl-grp" key={g.group}>
                  <div className="cl-grp-head">
                    <span className="cl-grp-name">{g.group}</span>
                    <span className="cl-grp-spend">
                      ${Math.round(g.spend).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <ul className="cl-list">
                    {g.campaigns.map((c) => (
                      <li className="cl-item" key={c.campaignId || c.name}>
                        <span className={`dot ${c.state}`} aria-hidden="true" />
                        <span className="cl-item-name">{c.name}</span>
                        <span className="cl-item-state">{STATE_LABEL[c.state]}</span>
                        <span className="cl-item-spend">
                          ${Math.round(c.spend).toLocaleString('en-GB')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          <Link href="/reporting">Upload an export</Link>
        ) : (
          'Loading…'
        )}
      </footer>
    </section>
  );
}

/** One rung of the hierarchy: a proportion bar and the five counts. */
function Level({ label, counts }) {
  const has = counts.total > 0;
  return (
    <div className="lvl">
      <div className="lvl-head">
        <span className="lvl-lab">{label}</span>
        <span className="lvl-total">
          {has ? `${counts.total} total` : 'nothing uploaded'}
        </span>
      </div>
      <div className="cl-bar" role="img" aria-label={barLabel(counts)}>
        {has ? (
          STATES.filter((s) => counts[s] > 0).map((s) => (
            <span key={s} className={`seg ${s}`} style={{ width: `${counts.pct[s]}%` }} />
          ))
        ) : (
          <span className="seg empty" />
        )}
      </div>
      <dl className="cl-counts">
        {STATES.map((s) => (
          <div className={`cl-count ${s}`} key={s}>
            <dt>{STATE_LABEL[s]}</dt>
            <dd>{counts[s]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function barLabel(c) {
  if (!c.total) return 'No data uploaded';
  return STATES.filter((s) => c[s] > 0)
    .map((s) => `${c[s]} ${s}`)
    .join(', ');
}
