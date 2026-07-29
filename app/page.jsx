import Link from 'next/link';
import { TOOLS, API_TOOLS } from '@/lib/tools';

export default function Home() {
  return (
    <div className="index">
      <h1>LinkedIn Ads Toolkit</h1>
      <p className="index-sub">
        {TOOLS.length + API_TOOLS.length} tools · {TOOLS.length} work offline ·{' '}
        {API_TOOLS.length} need LinkedIn API access
      </p>

      <h2 className="index-group">Planning &amp; delivery — no API needed</h2>
      <div className="index-grid">
        {TOOLS.map((t) => (
          <Link key={t.route} href={`/${t.route}`} className="card">
            <div className="card-form">{t.form}</div>
            <div className="card-name">{t.name}</div>
            <div className="card-blurb">{t.blurb}</div>
          </Link>
        ))}
      </div>

      <h2 className="index-group">Connected to LinkedIn</h2>
      <div className="index-grid">
        {API_TOOLS.map((t) => (
          <Link key={t.route} href={`/${t.route}`} className="card api">
            <div className="card-form">{t.form}</div>
            <div className="card-name">{t.name}</div>
            <div className="card-blurb">{t.blurb}</div>
          </Link>
        ))}
      </div>

      <div className="notice">
        <strong>Everything on the top row works today.</strong> Data lives in this browser
        only — nothing is sent anywhere. Use <code>Briefs</code> to export before switching
        machines.
        <br />
        <br />
        The connected tools need a LinkedIn developer app and the Advertising API product
        approved. Once you have credentials, visit <code>/api/linkedin/connect</code> once
        to obtain a refresh token. Until then those two pages will tell you what is missing
        rather than failing silently.
      </div>
    </div>
  );
}
