'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { storage } from '@/lib/storage';
import { CURRENT_KEY, clientKey, objectivesOf } from '@/lib/brief';

/**
 * Saved briefs.
 *
 * Every tool reads `brief:current`, so "open" here means copying the chosen
 * brief over that key. That is the whole mechanism: one active brief, and
 * the tools follow it. Nothing has to know this page exists.
 *
 * Briefs are saved per client from the intake form, so the list is short by
 * design. It is a switcher, not an archive.
 */

const PREFIX = 'brief:client:';

export default function BriefsLibrary() {
  const [briefs, setBriefs] = useState([]);
  const [current, setCurrent] = useState(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    const out = [];
    try {
      const { keys } = await storage.list(PREFIX);
      for (const k of keys) {
        try {
          const r = await storage.get(k);
          const b = JSON.parse(r.value);
          out.push({ key: k, name: k.slice(PREFIX.length), brief: b });
        } catch {
          /* unreadable entry, skip rather than break the list */
        }
      }
    } catch {
      /* nothing saved yet */
    }
    setBriefs(out.sort((a, b) => a.name.localeCompare(b.name)));

    try {
      const r = await storage.get(CURRENT_KEY);
      setCurrent(JSON.parse(r.value));
    } catch {
      setCurrent(null);
    }
    setReady(true);
  };

  useEffect(() => {
    load();
  }, []);

  const open = async (entry) => {
    await storage.set(CURRENT_KEY, JSON.stringify(entry.brief));
    setCurrent(entry.brief);
    setMessage(
      `${entry.name} is now the active brief. Intake, Naming, Creative, Plan score and QA all read from it.`
    );
  };

  const remove = async (entry) => {
    if (!confirm(`Delete the saved brief for ${entry.name}? This cannot be undone.`)) return;
    await storage.delete(entry.key);
    setMessage(`Deleted the saved brief for ${entry.name}.`);
    load();
  };

  const isActive = (entry) =>
    current &&
    current.client === entry.brief.client &&
    current.campaignName === entry.brief.campaignName;

  const filled = (b) =>
    Object.values(b).filter((v) => (Array.isArray(v) ? v.length : String(v ?? '').trim())).length;

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Briefs</h1>
            <div className="linked">
              {ready
                ? briefs.length
                  ? `${briefs.length} saved. Open one to drive every other tool from it.`
                  : 'Nothing saved yet'
                : 'Reading saved briefs…'}
            </div>
          </div>
          <Link href="/intake" className="btn ghost">
            New brief
          </Link>
        </header>

        <div className="br-body">
          {message && <div className="br-msg">{message}</div>}

          {ready && !briefs.length && (
            <p className="br-empty">
              No briefs have been saved in this browser. Fill in the{' '}
              <Link href="/intake">intake form</Link>, choose a client, and press Save. It appears
              here, and opening it here makes every other tool read from it.
            </p>
          )}

          {briefs.map((entry) => {
            const b = entry.brief;
            const objectives = objectivesOf(b);
            const active = isActive(entry);
            return (
              <section className={active ? 'br-card on' : 'br-card'} key={entry.key}>
                <div className="br-top">
                  <div>
                    <h2 className="br-name">
                      {b.client || entry.name}
                      {b.campaignName && <span className="br-camp">{b.campaignName}</span>}
                    </h2>
                    <div className="br-meta">
                      {objectives.length ? objectives.join(', ') : 'No objective set'}
                      {b.markets ? ` · ${b.markets}` : ''}
                      {b.budget ? ` · $${Number(b.budget).toLocaleString('en-GB')}` : ''}
                      {b.months ? ` over ${b.months} month${b.months === '1' ? '' : 's'}` : ''}
                    </div>
                  </div>
                  <div className="br-actions">
                    {active && <span className="br-badge">Active</span>}
                    <button type="button" className="btn" onClick={() => open(entry)}>
                      {active ? 'Reload' : 'Open'}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => remove(entry)}>
                      Delete
                    </button>
                  </div>
                </div>

                <dl className="br-facts">
                  <div>
                    <dt>Fields filled</dt>
                    <dd>{filled(b)}</dd>
                  </div>
                  <div>
                    <dt>Creative</dt>
                    <dd>
                      {b.creatives?.length
                        ? `${b.creatives.reduce((n, c) => n + (Number(c.quantity) || 0), 0)} assets`
                        : 'none set'}
                    </dd>
                  </div>
                  <div>
                    <dt>Starts</dt>
                    <dd>{b.startDate || 'not set'}</dd>
                  </div>
                  <div>
                    <dt>Insight Tag</dt>
                    <dd>{b.insightTag || 'not asked'}</dd>
                  </div>
                </dl>

                {active && (
                  <nav className="br-links">
                    <span className="br-links-lab">Open in</span>
                    {[
                      ['intake', 'Intake'],
                      ['naming', 'Naming'],
                      ['creative', 'Creative'],
                      ['plan', 'Plan score'],
                      ['qa', 'QA'],
                    ].map(([r, n]) => (
                      <Link key={r} href={`/${r}`} className="br-link">
                        {n}
                      </Link>
                    ))}
                  </nav>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

const CSS = `
.masthead{max-width:940px;}
.br-body{max-width:940px;margin:0 auto;border:1px solid var(--ink);border-top:none;
  background:var(--white);padding:16px 22px 20px;}
.br-msg{margin-bottom:14px;padding:10px 12px;background:#F4F7F2;border-left:3px solid var(--ok);
  font-size:12.5px;line-height:1.55;color:#255740;}
.br-empty{margin:0;font-size:13px;line-height:1.6;color:var(--ink-2);}
.br-empty a{color:var(--carbon);}
.br-card{border:1px solid var(--rule);padding:13px 15px 14px;margin-bottom:12px;}
.br-card:last-child{margin-bottom:0;}
.br-card.on{border-color:var(--carbon);background:#F8F7FC;}
.br-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;}
.br-name{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:17px;
  text-transform:uppercase;letter-spacing:.03em;margin:0;display:flex;align-items:baseline;
  gap:9px;flex-wrap:wrap;}
.br-camp{font-family:'Courier Prime',monospace;font-size:12px;font-weight:400;
  text-transform:none;letter-spacing:0;color:var(--carbon);}
.br-meta{font-size:11.5px;line-height:1.5;color:var(--ink-2);margin-top:3px;}
.br-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.br-badge{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--white);background:var(--carbon);
  padding:3px 7px;}
.br-actions .btn{height:30px;padding:0 13px;display:inline-flex;align-items:center;
  font-size:10px;}
.br-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;
  margin:12px 0 0;padding-top:10px;border-top:1px dotted var(--rule);}
.br-facts dt{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.15em;text-transform:uppercase;color:var(--ink-2);margin-bottom:2px;}
.br-facts dd{font-family:'Courier Prime',monospace;font-size:12.5px;margin:0;color:var(--ink);}
.br-links{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:11px;
  padding-top:10px;border-top:1px dotted var(--rule);}
.br-links-lab{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);}
.br-link{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--carbon);text-decoration:none;
  border:1px solid var(--rule);padding:4px 9px;}
.br-link:hover{background:var(--carbon);color:var(--white);border-color:var(--carbon);}
@media (max-width:700px){
  .sheet{padding:10px;}
  .br-body{padding:14px;}
}
`;
