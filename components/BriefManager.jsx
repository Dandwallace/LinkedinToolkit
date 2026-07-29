'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

/* ------------------------------------------------------------------ *
 * Brief manager.
 *
 * The other seven tools each read a single shared key (brief:current,
 * qa:current and so on). That works for one client and breaks for two.
 *
 * Rather than rewrite all of them, this keeps a proper set of briefs and
 * mirrors the active one into those shared keys. Activating a brief
 * copies it in; loading this page copies whatever the tools last wrote
 * back out. The other tools need no changes.
 * ------------------------------------------------------------------ */

const INDEX_KEY = 'briefs:index';

/* Keys the tools write to, and where they get parked per brief. */
const MIRRORED = [
  { live: 'brief:current', per: (id) => `brief:${id}`, tool: 'Intake', form: 'LA-01' },
  { live: 'forecast:current', per: (id) => `forecast:${id}`, tool: 'Forecast', form: 'LA-02' },
  { live: 'qa:current', per: (id) => `qa:${id}`, tool: 'QA checklist', form: 'LA-05' },
];

const TOOLS = [
  { form: 'LA-01', name: 'Intake form', role: 'Capture the brief on the call' },
  { form: 'LA-02', name: 'Pipeline forecast', role: 'Budget to pipeline, and back' },
  { form: 'LA-03', name: 'Budget allocation', role: 'Split spend across the funnel' },
  { form: 'LA-04', name: 'Naming & tracking', role: 'Campaign names and tagged URLs' },
  { form: 'LA-05', name: 'Pre-launch QA', role: 'Thirty-three checks, seventeen blocking' },
  { form: 'LA-06', name: 'Creative check', role: 'Copy limits and format specs' },
  { form: 'LA-07', name: 'Test significance', role: 'Is the difference real yet' },
  { form: 'LA-08', name: 'Performance analysis', role: 'From a Campaign Manager export' },
];

const get = async (k) => {
  try {
    const r = await window.storage.get(k);
    return r?.value ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
};
const put = async (k, v) => {
  try {
    await window.storage.set(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};
const drop = async (k) => {
  try {
    await window.storage.delete(k);
  } catch {
    /* already gone */
  }
};

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ------------------------------------------------------------------ */

export default function BriefManager() {
  const [index, setIndex] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState('Loading…');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const booted = useRef(false);

  /* ---- boot: read the index, capture whatever the tools last wrote ---- */
  useEffect(() => {
    (async () => {
      const idx = (await get(INDEX_KEY)) || [];
      const liveBrief = await get('brief:current');

      let activeEntry = idx.find((b) => b.active);

      /* Someone has used the intake form without ever creating a brief here.
       * Adopt whatever is in the live key rather than losing it. */
      if (!activeEntry && liveBrief) {
        const id = newId();
        activeEntry = {
          id,
          client: liveBrief.client || 'Untitled brief',
          sector: liveBrief.sector || '',
          created: Date.now(),
          updated: Date.now(),
          active: true,
        };
        idx.unshift(activeEntry);
        await put(`brief:${id}`, liveBrief);
        for (const m of MIRRORED.slice(1)) {
          const v = await get(m.live);
          if (v) await put(m.per(id), v);
        }
        await put(INDEX_KEY, idx);
        setStatus('Adopted an existing brief from the intake form');
      } else if (activeEntry) {
        /* Pull the tools' current state back into the active record. */
        for (const m of MIRRORED) {
          const v = await get(m.live);
          if (v) await put(m.per(activeEntry.id), v);
        }
        if (liveBrief?.client && liveBrief.client !== activeEntry.client) {
          activeEntry.client = liveBrief.client;
          activeEntry.updated = Date.now();
          await put(INDEX_KEY, idx);
        }
        setStatus('');
      } else {
        setStatus('No briefs yet');
      }

      setIndex(idx);
      if (activeEntry) {
        setActiveId(activeEntry.id);
        setActive(await get(`brief:${activeEntry.id}`));
      }
      booted.current = true;
    })();
  }, []);

  const saveIndex = useCallback(async (next) => {
    setIndex(next);
    await put(INDEX_KEY, next);
  }, []);

  /* ---- switch active brief ---- */
  const activate = async (id) => {
    if (id === activeId || busy) return;
    setBusy(true);
    setStatus('Switching…');

    /* Park the outgoing brief's live state. */
    if (activeId) {
      for (const m of MIRRORED) {
        const v = await get(m.live);
        if (v) await put(m.per(activeId), v);
      }
    }

    /* Load the incoming one into the keys the tools read. */
    for (const m of MIRRORED) {
      const v = await get(m.per(id));
      if (v) await put(m.live, v);
      else await drop(m.live);
    }

    const next = index.map((b) => ({ ...b, active: b.id === id }));
    await saveIndex(next);
    setActiveId(id);
    setActive(await get(`brief:${id}`));
    setBusy(false);
    setStatus(`Switched to ${next.find((b) => b.id === id)?.client || 'brief'}`);
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const name = prompt('Client name for the new brief?');
    if (!name) {
      setBusy(false);
      return;
    }
    /* Park the current one first. */
    if (activeId) {
      for (const m of MIRRORED) {
        const v = await get(m.live);
        if (v) await put(m.per(activeId), v);
      }
    }
    const id = newId();
    const brief = { client: name.trim() };
    await put(`brief:${id}`, brief);
    await put('brief:current', brief);
    for (const m of MIRRORED.slice(1)) await drop(m.live);

    const next = [
      { id, client: name.trim(), sector: '', created: Date.now(), updated: Date.now(), active: true },
      ...index.map((b) => ({ ...b, active: false })),
    ];
    await saveIndex(next);
    setActiveId(id);
    setActive(brief);
    setBusy(false);
    setStatus(`Created ${name.trim()} — open the intake form to fill it in`);
  };

  const duplicate = async (id) => {
    setBusy(true);
    const src = index.find((b) => b.id === id);
    const data = await get(`brief:${id}`);
    const copyId = newId();
    await put(`brief:${copyId}`, { ...(data || {}), client: `${src.client} (copy)` });
    for (const m of MIRRORED.slice(1)) {
      const v = await get(m.per(id));
      if (v) await put(m.per(copyId), v);
    }
    await saveIndex([
      ...index,
      {
        id: copyId,
        client: `${src.client} (copy)`,
        sector: src.sector,
        created: Date.now(),
        updated: Date.now(),
        active: false,
      },
    ]);
    setBusy(false);
    setStatus(`Duplicated ${src.client}`);
  };

  const remove = async (id) => {
    const b = index.find((x) => x.id === id);
    if (!confirm(`Delete the brief for ${b.client}? This cannot be undone.`)) return;
    setBusy(true);
    for (const m of MIRRORED) await drop(m.per(id));
    const next = index.filter((x) => x.id !== id);
    if (id === activeId) {
      for (const m of MIRRORED) await drop(m.live);
      setActiveId(null);
      setActive(null);
      if (next[0]) next[0].active = true;
    }
    await saveIndex(next);
    if (id === activeId && next[0]) await activate(next[0].id);
    setBusy(false);
    setStatus(`Deleted ${b.client}`);
  };

  /* ---- export / import ---- */
  const exportAll = async () => {
    const payload = { exported: new Date().toISOString(), version: 1, briefs: [] };
    for (const b of index) {
      const entry = { meta: b, data: {} };
      for (const m of MIRRORED) {
        const v = await get(m.per(b.id));
        if (v) entry.data[m.live] = v;
      }
      payload.briefs.push(entry);
    }
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    setStatus(`Copied ${index.length} brief${index.length === 1 ? '' : 's'} to the clipboard`);
  };

  const runImport = async () => {
    let payload;
    try {
      payload = JSON.parse(importText);
    } catch {
      setStatus('That is not valid JSON');
      return;
    }
    if (!Array.isArray(payload?.briefs)) {
      setStatus('No briefs found in that file');
      return;
    }
    setBusy(true);
    const added = [];
    for (const entry of payload.briefs) {
      const id = newId();
      for (const [liveKey, value] of Object.entries(entry.data || {})) {
        const m = MIRRORED.find((x) => x.live === liveKey);
        if (m) await put(m.per(id), value);
      }
      added.push({
        id,
        client: entry.meta?.client || 'Imported brief',
        sector: entry.meta?.sector || '',
        created: entry.meta?.created || Date.now(),
        updated: Date.now(),
        active: false,
      });
    }
    await saveIndex([...index, ...added]);
    setImporting(false);
    setImportText('');
    setBusy(false);
    setStatus(`Imported ${added.length} brief${added.length === 1 ? '' : 's'}`);
  };

  const date = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const filled = active
    ? Object.entries(active).filter(([, v]) =>
        Array.isArray(v) ? v.length : String(v ?? '').trim()
      ).length
    : 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Toolkit index</h1>
            <div className="linked">
              {index.length} brief{index.length === 1 ? '' : 's'} ·{' '}
              {activeId ? 'one active' : 'none active'}
            </div>
          </div>
          <dl className="mast-meta">
            <div>
              <dt>Form</dt>
              <dd>LA-00</dd>
            </div>
          </dl>
        </header>

        {status && <div className="status">{status}</div>}

        <div className="body">
          {/* ---------------- briefs ---------------- */}
          <section className="block">
            <div className="block-head">
              Client briefs
              <div className="acts">
                <button type="button" className="btn" onClick={create} disabled={busy}>
                  New brief
                </button>
                <button type="button" className="btn ghost" onClick={exportAll} disabled={!index.length}>
                  Export all
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setImporting((v) => !v)}
                >
                  {importing ? 'Cancel' : 'Import'}
                </button>
              </div>
            </div>

            {importing && (
              <div className="import">
                <textarea
                  className="ta"
                  rows={5}
                  placeholder="Paste exported JSON here"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <button type="button" className="btn" onClick={runImport} disabled={!importText.trim()}>
                  Import briefs
                </button>
              </div>
            )}

            {!index.length && (
              <p className="none">
                No briefs yet. Create one here, or just start filling in the intake form — this page
                will adopt whatever it finds next time you open it.
              </p>
            )}

            {index.map((b) => (
              <div className={`brief${b.id === activeId ? ' on' : ''}`} key={b.id}>
                <button
                  type="button"
                  className="brief-main"
                  onClick={() => activate(b.id)}
                  disabled={busy}
                >
                  <span className="brief-dot">{b.id === activeId ? '●' : '○'}</span>
                  <span className="brief-name">{b.client}</span>
                  {b.sector && <span className="brief-sector">{b.sector}</span>}
                  <span className="brief-date">{date(b.created)}</span>
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => duplicate(b.id)}
                  disabled={busy}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="mini del"
                  onClick={() => remove(b.id)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            ))}
          </section>

          {/* ---------------- active brief ---------------- */}
          {active && (
            <section className="block">
              <div className="block-head">
                Active brief
                <span className="range">
                  {filled} field{filled === 1 ? '' : 's'} captured
                </span>
              </div>
              <div className="facts">
                {[
                  ['Client', active.client],
                  ['Sector', active.sector],
                  ['Objective', active.objective],
                  ['Budget', active.budget && `£${Number(active.budget).toLocaleString('en-GB')}`],
                  ['Duration', active.months && `${active.months} months`],
                  ['Markets', active.markets],
                  ['Insight Tag', active.insightTag],
                  ['CRM', active.crm],
                ]
                  .filter(([, v]) => v)
                  .map(([l, v]) => (
                    <div className="fact" key={l}>
                      <span className="fact-lab">{l}</span>
                      <span className="fact-val">{v}</span>
                    </div>
                  ))}
              </div>
              {filled <= 1 && (
                <p className="none mt">
                  Nothing captured yet. Open the intake form (LA-01) — it writes straight back here.
                </p>
              )}
            </section>
          )}

          {/* ---------------- tools ---------------- */}
          <section className="block">
            <div className="block-head">
              Tools
              <span className="range">open each separately — state follows the active brief</span>
            </div>
            <div className="tools">
              {TOOLS.map((t) => (
                <div className="tool" key={t.form}>
                  <span className="tool-form">{t.form}</span>
                  <span className="tool-name">{t.name}</span>
                  <span className="tool-role">{t.role}</span>
                </div>
              ))}
            </div>
            <p className="caveat">
              Intake, forecast and QA save their state per brief. Allocation, naming, creative and
              significance are calculators — they read the brief but keep nothing, so there is
              nothing to lose when you switch.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

const CSS = `
.masthead,.status,.body{max-width:920px;margin-left:auto;margin-right:auto;}
.status{background:var(--canary);border-left:1px solid var(--ink);border-right:1px solid var(--ink);
  border-bottom:1px solid var(--rule-2);padding:8px 22px;
  font-family:'Courier Prime',monospace;font-size:12px;color:#7A6A2E;}
.body{border:1px solid var(--ink);background:var(--white);}
.block-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11.5px;
  letter-spacing:.15em;text-transform:uppercase;margin-bottom:12px;flex-wrap:wrap;}
.acts{display:flex;gap:6px;flex-wrap:wrap;}
.btn{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.13em;text-transform:uppercase;padding:7px 13px;cursor:pointer;
  background:var(--carbon);color:var(--white);border:1px solid var(--carbon);}
.import{margin-bottom:14px;}
.ta{width:100%;font-family:'Courier Prime',monospace;font-size:11.5px;line-height:1.55;
  color:var(--carbon);background:#FBFAF6;border:1px solid var(--rule);padding:8px 10px;
  border-radius:0;outline:none;resize:vertical;margin-bottom:7px;}
.none{margin:0;font-size:12.5px;line-height:1.6;color:var(--ink-2);}
.none.mt{margin-top:10px;}
.brief{display:flex;align-items:stretch;gap:5px;border-bottom:1px dotted var(--rule);}
.brief:last-child{border-bottom:none;}
.brief.on{background:#F5F4FA;margin:0 -10px;padding:0 10px;}
.brief-main{flex:1;display:flex;align-items:baseline;gap:10px;text-align:left;
  background:none;border:none;padding:9px 0;cursor:pointer;min-width:0;}
.brief-main:disabled{cursor:default;}
.brief-dot{color:var(--carbon);font-size:10px;flex:none;}
.brief-name{font-size:13.5px;font-weight:600;flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.brief.on .brief-name{color:var(--carbon);}
.brief-sector{font-size:11px;color:var(--ink-2);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;max-width:170px;}
.brief-date{font-family:'Courier Prime',monospace;font-size:11px;color:var(--ink-2);flex:none;}
.brief-main:focus-visible{outline:2px solid var(--carbon);outline-offset:-2px;}
.mini{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.12em;text-transform:uppercase;background:none;border:1px solid var(--rule);
  color:var(--ink-2);padding:3px 8px;cursor:pointer;align-self:center;white-space:nowrap;}
.mini:disabled{opacity:.4;cursor:default;}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
  border-top:1px solid var(--rule);border-left:1px solid var(--rule);}
.fact{padding:9px 12px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);}
.fact-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);margin-bottom:3px;}
.fact-val{font-family:'Courier Prime',monospace;font-size:13px;color:var(--carbon);
  word-break:break-word;}
.tools{border-top:1px solid var(--rule);}
.tool{display:grid;grid-template-columns:52px 1fr 1.25fr;align-items:baseline;gap:12px;
  padding:8px 0;border-bottom:1px dotted var(--rule);}
.tool:last-child{border-bottom:none;}
.tool-form{font-family:'Courier Prime',monospace;font-size:12px;color:var(--carbon);}
.tool-name{font-size:13px;font-weight:500;}
.tool-role{font-size:12px;color:var(--ink-2);}
.caveat{margin:12px 0 0;font-size:10.5px;line-height:1.55;color:var(--ink-2);}
@media (max-width:640px){
  .sheet{padding:10px;}
  .block{padding:12px 14px 16px;}
  .masthead,.status{padding-left:14px;padding-right:14px;}
  .brief{flex-wrap:wrap;}
  .brief-main{width:100%;}
  .tool{grid-template-columns:46px 1fr;}
  .tool-role{grid-column:2;font-size:11.5px;}
}
`;
