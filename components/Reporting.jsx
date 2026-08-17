'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { parseExportFile } from '@/lib/parse-export';
import {
  CLIENTS,
  saveClientData,
  loadAllClients,
  clearClientData,
  clearAllClientData,
  money,
} from '@/lib/client-store';
import AnalysisView from '@/components/AnalysisView';

/**
 * Reporting.
 *
 * One page, two ways in: an exported file, or the API. They were separate
 * tools, which meant the same analysis existed twice and the two drifted.
 * The row shapes already matched, so the split bought nothing.
 *
 * Upload works on any account you can open in Campaign Manager. The API
 * needs the Advertising API product approved, which not every account has,
 * so upload stays the default mode.
 */

const CURRENCY = '$';

export default function Reporting() {
  const [mode, setMode] = useState('upload');

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Reporting</h1>
            <div className="linked">From an export, or straight from the API</div>
          </div>
        </header>

        <div className="modebar">
          <button
            type="button"
            className={mode === 'upload' ? 'mode on' : 'mode'}
            onClick={() => setMode('upload')}
          >
            Upload an export
          </button>
          <button
            type="button"
            className={mode === 'api' ? 'mode on' : 'mode'}
            onClick={() => setMode('api')}
          >
            Pull from the API
          </button>
        </div>

        <div className="body">
          {mode === 'upload' ? <UploadMode /> : <ApiMode />}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Mode 1: an exported file
 * ------------------------------------------------------------------ */

function UploadMode() {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [client, setClient] = useState(CLIENTS[0].id);
  const [savedTo, setSavedTo] = useState(null);
  /* Bumped after any write so the stored-reports panel re-reads. */
  const [storeVersion, setStoreVersion] = useState(0);
  const inputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSavedTo(null);
    try {
      const result = await parseExportFile(file);
      if (!result.ok) {
        setParsed(null);
        setError(result.error);
      } else {
        setParsed(result);
      }
    } catch (err) {
      setParsed(null);
      setError(`Could not read that file: ${err.message}`);
    }
    setBusy(false);
  }, []);

  const save = async () => {
    try {
      await saveClientData(client, parsed);
      setSavedTo(CLIENTS.find((c) => c.id === client).name);
      setStoreVersion((v) => v + 1);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
  };

  const reportType = parsed?.reportType || 'Unspecified report';

  const num = (n) => Math.round(n || 0).toLocaleString('en-GB');

  return (
    <>
      <section className="block input-block">
        <div className="block-head">Upload export</div>
        <div
          className={`drop${dragging ? ' over' : ''}${busy ? ' busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <span className="drop-main">
            {busy ? 'Reading…' : dragging ? 'Drop it' : 'Drop the export here'}
          </span>
          <span className="drop-sub">
            or click to choose a file. .csv, .tsv or the .xls Campaign Manager produces
          </span>
          <span className="drop-note">
            The native export is tab-separated UTF-16 with metadata lines above the header.
            That is handled, so do not open and re-save it first.
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xls,text/csv,text/plain"
            className="drop-input"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {error && (
          <div className="issue blocker">
            <span className="issue-tag">Could not read</span>
            {error}
          </div>
        )}
      </section>

      {parsed?.ok && (
        <>
          <section className="block">
            <div className="block-head">
              What was parsed
              <span className="range">{parsed.filename}</span>
            </div>
            <div className="stats">
              {[
                ['Report type', reportType],
                ['Encoding', parsed.encoding],
                ['Delimiter', parsed.delimiter],
                ['Header on line', String(parsed.metadataLines + 1)],
                ['Granularity', parsed.granularity],
                ['Rows', num(parsed.rows.length)],
                [parsed.labels.group, num(parsed.groups.length || 0)],
                [parsed.labels.unit, num(parsed.campaigns.length)],
                ['Range', parsed.from ? `${parsed.from} to ${parsed.to}` : 'no dates'],
                /* Campaign Manager writes slashed dates in the account's own
                 * locale, so which way round they were read is worth showing:
                 * it is the difference between 7 March and 3 July. */
                ['Dates read as', parsed.dateOrder === 'mdy' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'],
              ].map(([l, v]) => (
                <div className="stat" key={l}>
                  <span className="stat-lab">{l}</span>
                  <span className="stat-val sm">{v}</span>
                </div>
              ))}
            </div>

            <div className="found">
              <span className="found-lab">Columns matched</span>
              <span className="found-list">
                {parsed.columns.map((c) => (
                  <span className="tag" key={c}>
                    {c}
                  </span>
                ))}
              </span>
            </div>

            {parsed.preamble.length > 0 && (
              <div className="found">
                <span className="found-lab">Skipped above the header</span>
                <span className="found-list mono">
                  {parsed.preamble.map((p, i) => (
                    <span key={i} className="pre-line">
                      {p}
                    </span>
                  ))}
                </span>
              </div>
            )}

            {parsed.rangeFrom === 'report' && (
              <p className="caveat">
                Every row in this export sits on the same day, because it is aggregated over the
                whole period rather than broken down by date. The range above is therefore the one
                asked for in Campaign Manager, read from the lines above the header.
              </p>
            )}

            {parsed.undated > 0 && (
              <p className="caveat">
                {parsed.undated} row{parsed.undated === 1 ? '' : 's'} carried no readable date.
                They count towards the totals but are left out of the day-of-week, fatigue and
                anomaly sections.
              </p>
            )}

            {!parsed.reportType && (
              <p className="caveat">
                The report type is usually on the first line above the header, and it is not in
                this file. That happens when an export has been opened and re-saved. It will be
                stored as an unspecified report, which means the next export with no type will
                replace it.
              </p>
            )}

            <div className="save-row">
              <span className="save-lab">Save against</span>
              <select
                className="save-sel"
                value={client}
                onChange={(e) => {
                  setClient(e.target.value);
                  setSavedTo(null);
                }}
              >
                {CLIENTS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" onClick={save}>
                Save
              </button>
              {savedTo && (
                <span className="saved">
                  Saved to {savedTo} as the {reportType}. Any other report types held for{' '}
                  {savedTo} are untouched. Health now shows on the dashboard.
                </span>
              )}
            </div>
          </section>

          <AnalysisView rows={parsed.rows} totals={parsed.totals} currency={CURRENCY} />
        </>
      )}

      <StoredReports version={storeVersion} onChange={() => setStoreVersion((v) => v + 1)} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * What is stored, and how to get rid of it
 *
 * Uploading the wrong client's export used to be unrecoverable without
 * clearing browser storage wholesale, which took the briefs with it. Reset
 * is per client, and it names the client in the confirmation, because the
 * failure this exists to fix is filing data against the wrong one.
 * ------------------------------------------------------------------ */

function StoredReports({ version, onChange }) {
  const [clients, setClients] = useState(null);

  useEffect(() => {
    (async () => setClients(await loadAllClients()))();
  }, [version]);

  const held = (clients || []).filter((c) => c.data);

  const reset = async (c) => {
    const types = c.data.reports.map((r) => r.type).join(', ');
    const ok = window.confirm(
      `Clear all stored report data for ${c.name}?\n\nThis removes ${c.data.reports.length} ` +
        `report${c.data.reports.length === 1 ? '' : 's'} (${types}). ` +
        `No other client is affected. Saved briefs are not affected.`
    );
    if (!ok) return;
    await clearClientData(c.id);
    onChange();
  };

  const resetAll = async () => {
    const ok = window.confirm(
      `Clear stored report data for every client?\n\nThis removes ${held.length} ` +
        `client${held.length === 1 ? "'s" : "s'"} uploaded reports. Saved briefs are not affected.`
    );
    if (!ok) return;
    await clearAllClientData();
    onChange();
  };

  return (
    <section className="block">
      <div className="block-head">
        Stored report data
        {held.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={resetAll}>
            Clear all report data
          </button>
        )}
      </div>

      {clients === null && <p className="none">Reading saved data…</p>}
      {clients !== null && held.length === 0 && (
        <p className="none">Nothing stored against any client yet.</p>
      )}

      {held.map((c) => (
        <div className="store" key={c.id}>
          <div className="store-head">
            <span className="store-name">{c.name}</span>
            <span className="store-spend">{money(c.spend)}</span>
            <button type="button" className="btn ghost sm" onClick={() => reset(c)}>
              Reset {c.name}
            </button>
          </div>
          <ul className="store-list">
            {c.data.reports.map((r) => (
              <li className="store-row" key={r.type}>
                <span className="store-type">{r.type}</span>
                <span className="store-meta">
                  {r.from && r.to ? `${r.from} to ${r.to}` : 'no dates'}
                  {' · '}
                  {r.campaigns.length} row{r.campaigns.length === 1 ? '' : 's'}
                  {r.hasStatus ? ' · carries status' : ' · no status column'}
                </span>
                <span className="store-when">
                  uploaded {new Date(r.savedAt).toLocaleDateString('en-GB')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {held.length > 0 && (
        <p className="caveat">
          Report types are stored separately because they cannot be combined: a Performance
          report and a Delivery report describe different things and carry different columns.
          Status counts are read from whichever report carries a status column and spend from
          whichever carries spend, so the dates above are worth comparing.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Mode 2: the API
 * ------------------------------------------------------------------ */

function ApiMode() {
  const [accounts, setAccounts] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [account, setAccount] = useState('');
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/linkedin/accounts');
        const data = await res.json();
        if (!res.ok) {
          setApiError(data.error || 'Could not reach LinkedIn');
          return;
        }
        setAccounts(data.accounts);
        if (data.accounts?.length === 1) setAccount(String(data.accounts[0].id));
      } catch (err) {
        setApiError(err.message);
      }
    })();
  }, []);

  const load = async () => {
    if (!account) return;
    setLoading(true);
    setRows(null);
    try {
      const res = await fetch(
        `/api/linkedin/analytics?account=${encodeURIComponent(account)}&days=${days}`
      );
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error);
        setLoading(false);
        return;
      }
      setApiError(null);
      setRows(data.rows);
    } catch (err) {
      setApiError(err.message);
    }
    setLoading(false);
  };

  return (
    <>
      <section className="block input-block">
        <div className="block-head">Pull from LinkedIn</div>

        {apiError && (
          <div className="issue blocker">
            <span className="issue-tag">Not connected</span>
            {apiError}
            <br />
            This mode needs a LinkedIn developer app with the Advertising API product approved.
            Upload an export instead if this account is not connected.
          </div>
        )}

        <div className="save-row">
          <span className="save-lab">Account</span>
          <select
            className="save-sel"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            disabled={!accounts?.length}
          >
            <option value="">
              {accounts?.length ? 'Choose an account' : 'No accounts available'}
            </option>
            {(accounts || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span className="save-lab">Days</span>
          <select className="save-sel" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={load} disabled={!account || loading}>
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
      </section>

      {rows?.length > 0 && <AnalysisView rows={rows} currency={CURRENCY} />}
      {rows?.length === 0 && (
        <section className="block">
          <p className="none">No rows came back for that account and period.</p>
        </section>
      )}
    </>
  );
}

const CSS = `
.masthead{max-width:1000px;margin:0 auto;background:var(--white);border:1px solid var(--ink);
  border-bottom:none;padding:16px 22px 14px;display:flex;align-items:flex-end;
  justify-content:space-between;gap:20px;flex-wrap:wrap;}
.modebar{max-width:1000px;margin:0 auto;display:flex;gap:1px;background:var(--ink);
  border-left:1px solid var(--ink);border-right:1px solid var(--ink);}
.mode{flex:1;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10.5px;
  letter-spacing:.14em;text-transform:uppercase;padding:10px 12px;cursor:pointer;
  background:#2A2C27;color:#B9BAB4;border:none;}
.mode:hover{color:var(--white);}
.mode.on{background:var(--white);color:var(--ink);}
.mode:focus-visible{outline:2px solid var(--canary);outline-offset:-3px;}
.body{max-width:1000px;margin:0 auto;border:1px solid var(--ink);background:var(--white);}
.input-block{background:#F3F2EC;}
.block-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11.5px;
  letter-spacing:.15em;text-transform:uppercase;margin-bottom:10px;flex-wrap:wrap;}
.drop{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;
  padding:30px 20px;border:2px dashed var(--rule);background:var(--white);cursor:pointer;
  transition:background .12s,border-color .12s;}
.drop:hover{border-color:var(--carbon);background:#F8F7FC;}
.drop.over{border-color:var(--carbon);background:#EDECF6;border-style:solid;}
.drop.busy{opacity:.6;cursor:default;}
.drop:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.drop-main{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:15px;
  letter-spacing:.08em;text-transform:uppercase;color:var(--carbon);}
.drop-sub{font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--ink-2);}
.drop-note{font-size:10.5px;line-height:1.5;color:var(--ink-2);max-width:420px;margin-top:4px;}
.drop-input{display:none;}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));
  border-top:1px solid var(--rule);border-left:1px solid var(--rule);}
.stat{padding:10px 12px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);}
.stat-lab{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);margin-bottom:3px;}
.stat-val{font-family:'Courier Prime',monospace;font-weight:700;font-size:17px;color:var(--carbon);}
.stat-val.sm{font-size:12.5px;font-weight:400;color:var(--ink);word-break:break-word;}
.found{display:flex;gap:12px;align-items:baseline;margin-top:11px;flex-wrap:wrap;}
.found-lab{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);width:150px;flex:none;}
.found-list{display:flex;flex-wrap:wrap;gap:4px;flex:1;min-width:200px;}
.found-list.mono{flex-direction:column;gap:2px;}
.tag{font-family:'Courier Prime',monospace;font-size:11px;color:var(--carbon);
  border:1px solid var(--rule);padding:1px 6px;background:#FBFAF6;}
.pre-line{font-family:'Courier Prime',monospace;font-size:11px;color:var(--ink-2);}
.save-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:14px;
  padding-top:12px;border-top:1px solid var(--rule);}
.input-block .save-row{margin-top:0;padding-top:0;border-top:none;}
.save-lab{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9.5px;
  letter-spacing:.17em;text-transform:uppercase;color:var(--ink-2);}
.save-sel{font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--carbon);
  background:var(--white);border:1px solid var(--rule);padding:6px 8px;border-radius:0;}
.save-sel:focus-visible{outline:2px solid var(--carbon);outline-offset:1px;}
.saved{font-size:11.5px;line-height:1.5;color:#255740;flex:1;min-width:220px;}
.btn:disabled{opacity:.45;cursor:default;}
.btn.ghost{background:transparent;color:var(--ink-2);border-color:var(--rule);}
.btn.ghost:hover{background:var(--white);color:var(--stamp);border-color:var(--stamp);}
.btn.sm{font-size:9px;letter-spacing:.12em;padding:5px 9px;}
.store{border-top:1px solid var(--rule);padding:11px 0 3px;}
.store:first-of-type{border-top:none;}
.store-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:7px;}
.store-name{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:12px;
  letter-spacing:.13em;text-transform:uppercase;}
.store-spend{font-family:'Courier Prime',monospace;font-weight:700;font-size:14px;
  color:var(--carbon);margin-right:auto;}
.store-list{list-style:none;margin:0;padding:0;}
.store-row{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:5px 0;
  border-top:1px dotted var(--rule);}
.store-type{font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--ink);}
.store-meta{grid-column:1;font-size:10.5px;color:var(--ink-2);}
.store-when{grid-row:1;grid-column:2;font-family:'Courier Prime',monospace;font-size:10.5px;
  color:var(--ink-2);white-space:nowrap;}
.tbl thead th{text-align:right;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-2);
  padding:5px 8px 6px 0;border-bottom:1px solid var(--rule);}
.tbl thead th:first-child{text-align:left;}
.tbl tbody th{text-align:left;font-family:'Archivo',sans-serif;font-weight:500;font-size:12.5px;
  color:var(--ink);padding:5px 8px 5px 0;border-bottom:1px dotted var(--rule);
  word-break:break-word;}
.tbl tbody td{text-align:right;font-family:'Courier Prime',monospace;font-size:12.5px;
  color:var(--ink-2);padding:5px 0 5px 8px;border-bottom:1px dotted var(--rule);}
.tbl tbody tr.poor th,.tbl tbody tr.poor td{background:#F9EDE9;color:#7A3B22;}
.tbl tbody tr.good th,.tbl tbody tr.good td{background:#EFF3ED;color:#255740;}
.verdict{margin:11px 0 0;font-size:12.5px;line-height:1.55;padding:9px 11px;
  border-left:3px solid var(--ok);background:#EFF3ED;color:#255740;}
.verdict.warn{border-left-color:var(--stamp);background:#F9EDE9;color:#7A3B22;}
.none{margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-2);}
.caveat{margin:10px 0 0;font-size:10.5px;line-height:1.5;color:var(--ink-2);}
.issue{margin-top:11px;padding:10px 12px;font-size:12.5px;line-height:1.5;
  border-left:3px solid var(--stamp);background:#F9EDE9;color:#7A3B22;}
.issue-tag{display:block;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.2em;text-transform:uppercase;color:var(--stamp);margin-bottom:3px;}
.summary{margin:0 0 11px;font-family:'Courier Prime',monospace;font-size:12px;line-height:1.65;
  color:var(--ink);background:#FBFAF6;border:1px solid var(--rule);padding:12px 14px;
  white-space:pre-wrap;word-break:break-word;}
@media (max-width:700px){
  .sheet{padding:10px;}
  .block{padding:12px 14px 16px;}
  .masthead{padding:14px 14px 12px;}
  .found-lab{width:auto;}
  .tbl thead th,.tbl tbody th,.tbl tbody td{font-size:11.5px;}
}
`;
