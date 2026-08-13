export const metadata = { title: 'Privacy · LinkedIn Ads Toolkit' };

/**
 * Privacy policy.
 *
 * Static, deliberately short, and kept out of the main nav. It exists so
 * there is something to point a LinkedIn app review or a client's
 * procurement team at, not as a page anybody working here needs to open.
 */
export default function Page() {
  return (
    <div className="sheet">
      <header className="masthead pv-head">
        <div>
          <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
          <h1 className="mast-title">Privacy</h1>
          <div className="linked">Last updated 13 August 2026</div>
        </div>
      </header>

      <div className="pv-body">
        <section className="block">
          <h2 className="pv-h">What this is</h2>
          <p>
            Internal tooling built for Whitehart. It is not a public service and is not offered
            to anyone outside the agency.
          </p>
        </section>

        <section className="block">
          <h2 className="pv-h">What it reads</h2>
          <p>
            It reads LinkedIn advertising data through the LinkedIn Marketing API, for the ad
            accounts the authorised user already administers. It reads nothing else.
          </p>
        </section>

        <section className="block">
          <h2 className="pv-h">Personal data</h2>
          <p>
            It stores no personal data about LinkedIn members.
          </p>
        </section>

        <section className="block">
          <h2 className="pv-h">Where data is kept</h2>
          <p>
            Campaign performance data is stored in the agency&rsquo;s own Google Sheets and
            Airtable.
          </p>
        </section>

        <section className="block">
          <h2 className="pv-h">Who can see it</h2>
          <p>Access is limited to Whitehart staff.</p>
        </section>

        <section className="block">
          <h2 className="pv-h">Contact</h2>
          <p>
            <a href="mailto:dan@whitehart.agency">dan@whitehart.agency</a>
          </p>
        </section>
      </div>
    </div>
  );
}
