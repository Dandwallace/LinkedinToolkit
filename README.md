# LinkedIn Ads Toolkit

Sixteen tools for planning, briefing, QA and reporting on LinkedIn Ads.
Twelve work with no credentials at all. Four talk to the LinkedIn API.

> **Scheduled jobs are currently paused** pending LinkedIn API access — see
> `PAUSED.md`. Nothing runs on a timer. The twelve planning tools are
> unaffected and work today.

Next.js App Router, one runtime dependency (`jspdf`), deploys to Vercel.

---

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Everything except Dayparting and Live reporting
works immediately — no setup, no account, no API.

---

## The tools

Listed in the order they are used, which is the order they appear in the nav.

| | Needs API |
|---|---|
| Intake, discovery capture with live flags, PDF and Monday.com export | |
| Naming, campaign names and tagged URLs | |
| Creative, brief the design team, export PDF | |
| Significance, is the difference real yet | |
| Retargeting, pool fill times and sequencing | |
| Plan score, score a plan before building it | |
| Best practices, sourced, with dates | |
| QA, 32 pre-launch checks, 16 blocking | |
| Reporting, from an export or from the API | ● |
| Dayparting, schedule delivery hours | ● |
| Monitor, budget pacing and frequency | ● |
| Companies, who actually saw the ads | ● |

Reporting sits in the connected group because its second mode pulls from the
API, but its upload mode works without credentials.

Saved briefs sits at the end of the nav rather than in the tool list. It is
the switcher: opening a brief there makes every tool read from it.

The home page is a dashboard rather than a menu: Marken, PCI and GCSG each
show healthy / flagged / paused counts and total spend derived from the
reports saved against them, a combined spend total across all three, and a
"Needs looking at" list of every flagged campaign across all three.

Reports are stored per report type, not one per client. A Performance report
and a Delivery report carry different columns and describe different things,
so they cannot be merged: the type is read from the export's first metadata
line, the most recent of each type is kept, and uploading a type that is
already held replaces only that one. Status counts come from whichever report
carries a status column and spend from whichever carries spend. The reporting
page lists what is held per client with the date each was uploaded, and has a
Reset per client plus a Clear all, for recovering from an export filed against
the wrong account.

LA-08 and LA-12 do the same analysis. One takes an exported file, the other
pulls it live. Keep both: the CSV route works on any account you have
Campaign Manager access to, including ones the API app is not approved for.

---

## Connecting LinkedIn

You need a LinkedIn developer app with the **Advertising API** product
approved. Development tier is enough — write access for up to 5 ad accounts,
unlimited reads.

1. Copy `.env.example` to `.env.local` and fill in the client ID and secret.
2. Add your redirect URI to the app's Auth tab, exactly as written in the env
   file.
3. Visit `/api/linkedin/connect` and authorise.
4. The callback shows a refresh token **once**. Paste it into
   `LINKEDIN_REFRESH_TOKEN` and restart.

Nothing is persisted server-side. The refresh token lives in the environment;
access tokens are cached in memory per serverless instance and refreshed on
cold start. That avoids needing a database purely to hold one string.

If LinkedIn does not return a refresh token, your app is not approved for
them — the access token will last about 60 days and you will need to
reconnect manually.

---

## Dayparting

LinkedIn has no native delivery scheduling: campaigns run continuously from
launch until paused. This closes that gap.

- Build rules at `/dayparting` — account, campaigns, timezone, day/time windows.
- Copy the JSON and commit it to `config/schedules.json`.
- Vercel Cron hits `/api/cron/dayparting` every 15 minutes (`vercel.json`).

**Why a committed file rather than a database:** schedules are configuration,
not data. Keeping them in the repo means they are version-controlled,
reviewable, and survive a cleared browser cache. The trade-off is a deploy to
change them, which for something that changes monthly is the right way round.

Preview a run without touching anything:

```
/api/cron/dayparting?dry=1
```

Set `CRON_SECRET` in production or the endpoint is open to anyone who finds
the URL.

**Safety behaviour:** only ever sets `ACTIVE` or `PAUSED`. Campaigns in any
other state — draft, archived, completed — are skipped and logged, because a
human put them there deliberately. Writes only happen when actual status
differs from intended, so a typical run is two reads and nothing else.

---

## Morning brief

`/api/cron/morning-brief` runs daily at 07:00, after the Sheets sync, and
emails a campaign health summary.

**It leads with exceptions, not totals.** A daily email that looks the same
every morning stops being read by week two, so the structure is: what needs
attention, then the numbers. When nothing is wrong it says so in one line
rather than padding.

The subject line carries the signal, so triage happens from the notification
without opening anything:

```
LinkedIn · 2 things need attention — 29 Jul
LinkedIn · 1 to look at — 29 Jul
LinkedIn · all healthy — 29 Jul
```

### What it checks

| | Level |
|---|---|
| Live campaign delivered nothing yesterday | urgent |
| No spend at all across the account | urgent |
| Leads stopped entirely this week | urgent |
| Budget pacing hot or cold, pro-rated | warn |
| Spend doubled against the recent daily average | warn |
| Cost per lead up more than 40% week on week | warn |
| Click-through down more than 30% week on week | note |
| Campaigns funded below the £10/day floor | note |

The first one is the reason this exists. A campaign that is live but
delivering nothing shows up nowhere in Campaign Manager as an error — it is
usually a declined card, a rejected ad, or an audience that has quietly
collapsed below the delivery threshold.

Two false positives are handled explicitly, because either would make the
brief unreadable:

- **A paused campaign is not reported as dark.** Dayparting sets campaigns to
  PAUSED, so silence from one is expected.
- **Dayparted weekends do not register as spend spikes.** The trailing average
  ignores zero-spend days, or every Monday would look like a doubling.

### Setup

Resend rather than SMTP — nothing to keep open from a serverless function, and
the free tier covers a daily brief many times over. Verify a domain, then set
`RESEND_API_KEY`, `BRIEF_FROM` and `BRIEF_TO`.

Without an email key it falls back to `SLACK_WEBHOOK_URL`, so the brief still
arrives somewhere rather than silently not being sent.

See it before trusting it:

```
/api/cron/morning-brief?preview=1
```

That renders the real email in the browser without sending anything.

---

## Monitoring

**Budget pacing** compares month-to-date spend against a cap, pro-rated for
how far through the month you are. That pro-rating is the point: £6,000 by
the 20th is fine against a £9,000 cap and alarming against a £7,000 one. A
flat "have we exceeded the cap" check only fires once the money is gone.

The daily cron at `/api/cron/spend-alarm` runs this across every account in
`config/budgets.json` and posts to Slack if `SLACK_WEBHOOK_URL` is set. It
still works without one — the Monitor page reads the same numbers on demand.

**Frequency** has constraints worth knowing, because they shape what the tool
can honestly claim:

- `approximateMemberReach` is available for non-demographic pivots only, so
  **per-company frequency does not exist**. Campaign level is the floor.
- Reach cannot be summed across windows. A weekly figure is not seven daily
  figures added up, so every window is queried directly.
- Reach is not reported beyond 92 days.
- Figures are approximate by design, to protect member privacy.

B2B tolerates far higher frequency than consumer platforms — 7 to 12 over a
30-day window is normal for tighter ABM campaigns, where a consumer benchmark
of 3 to 4 would look alarming. The bands scale to the window you select.

**Company engagement** answers which companies actually saw the work. Paste a
target account list and it separates "the list is working" from "we are
paying to reach people who are not on it". Caveats, all surfaced in the UI:

- Companies with fewer than three events are dropped entirely.
- Only the top 100 demographic values per creative per day are returned.
- Data lags 12 to 24 hours behind performance metrics.
- Results can include companies that were never targeted.
- Analytics returns organisation URNs, not names. Name resolution needs its
  own permission; without it the report still works, showing IDs.

---

## Where data lives

Three systems, each doing what it is good at:

```
LinkedIn API ──► this app ──┬──► Google Sheets ──► Looker Studio
                            │      campaign data      client reporting
                            └──► Airtable
                                  QA, briefs, project status
```

### Google Sheets → Looker Studio

`/api/cron/sync-sheets` runs daily, pulls every enabled client from
`config/clients.json`, and writes:

- **one combined tab** (`All clients`) — for your internal dashboard
- **one tab per client** — for that client's own report

Both carry the same columns:

```
date | client | account_id | campaign_id | campaign | impressions | clicks
     | spend | conversions | leads | ctr | cpc | cpm | cost_per_lead
```

**Why per-client tabs rather than one table with a filter.** A filter control
in Looker Studio is a convenience, not a permission — a viewer can change it.
Even a data-source-level filter is a configuration that can be got wrong. A
tab that only ever contains one client's rows cannot leak another's, however
the report is set up. At a small client count the extra tabs cost nothing, and
the failure being prevented is showing one client another's budget.

Missing tabs are created automatically, so adding a client to config is the
only step.

It rewrites a rolling 90-day window each run rather than appending. LinkedIn
backdates conversions as they arrive, so rewriting corrects yesterday's
numbers; append-only leaves permanently wrong recent history with no error to
notice. If a run returns nothing at all it refuses to write, rather than
wiping the sheet with an empty table.

**Setup:** create a Google Cloud project, enable the Sheets API, make a
service account, download the JSON key and paste the whole thing into
`GOOGLE_SERVICE_ACCOUNT_JSON`. Then **share the spreadsheet with the service
account's email as an Editor** — that step is the one everyone forgets, and it
produces a 403 the code explains rather than a raw API error.

Check before trusting it:

```
/api/google/check              confirms credentials, lists visible tabs
/api/cron/sync-sheets?dry=1    counts rows per client without writing
```

### Looker Studio

Two kinds of report, kept deliberately separate.

**Internal dashboard** — one report on the `All clients` tab with a filter
control on `client`. Never shared outside the agency.

**Client reports** — one per client, built on that client's own tab.

Whichever you build, three settings matter:

- **Owner's Credentials** on the data source. Viewers see the data through
  your authorisation, so clients never need access to the spreadsheet itself.
  Never share the sheet.
- **Disable download, print and copy** for viewers.
- **Prevent viewers seeing advanced applied filters**, so nobody goes poking
  at what else the data source might contain.

Set `date` to Date type when you create the data source, or every time-series
chart will misbehave.

Looker Studio does support proper row-level security through *filter by
viewer's email*, which matches a logged-in Google account against an email
column. That is the right answer at fifteen clients. At three, separate tabs
are simpler and harder to get wrong.

### Airtable

Two bases:

**QA & Delivery** — `Launches`, `QA Template` (the 33 checks, pre-seeded),
`QA Checks` (one row per check per launch, with owner, notes and attachments
for evidence). Editing a check in the template means every future launch
inherits it.

**Creative Briefs** — `Briefs` and `Creatives`, with attachment fields for the
exported PDF and the delivered assets.

Base IDs, for when you wire this up:

| Base | ID |
|---|---|
| QA & Delivery | `appNmt8ZX0J4BAxCO` |
| Creative Briefs | `appxFuQogVmgffxf6` |

The intake form writes to Airtable through `/api/airtable/brief`. Set
`AIRTABLE_TOKEN` (a Personal Access Token with `data.records:write`) and
`AIRTABLE_BASE_ID`, plus `AIRTABLE_BRIEFS_TABLE` if the table is not called
`Briefs`. The token stays server-side — the browser only ever posts the brief.
Everything else here is still used directly through the Airtable interface.

Airtable's API surface here cannot create link fields, so add these three by
hand — *Add field → Link to another record*:

| In table | Link to |
|---|---|
| QA Checks | Launches |
| QA Checks | QA Template |
| Creatives | Briefs |

Then a single automation on Launches — *when a record is created, find all QA
Template records and create a QA Check for each* — gives you a fresh checklist
per launch without any code.

---

## Storage

Seven components persist through `window.storage`, an API that only exists
inside the Claude artifact sandbox. `lib/storage.js` provides the same shape
backed by `localStorage` and installs it in `components/Nav.jsx` before any
tool renders.

One detail matters: `get` **throws** on a missing key rather than returning
null, because that is what the components' `try/catch` blocks expect. Change
that and briefs silently fail to load.

Data lives in one browser, including the per-client uploads behind the
dashboard (`lib/client-store.js`, one key per client).
To move to a server backend, swap the four method bodies in `lib/storage.js`
for calls to an API route — nothing else changes.

---

## Deploying

See **DEPLOY.md** for a step-by-step walkthrough. In short: push to GitHub,
import the repository in Vercel, done.

One thing to know up front: **Vercel's free tier only allows once-daily cron
jobs**, and a more frequent expression fails at deploy time. The spend alarm
is daily so it runs natively. Dayparting needs to run hourly, so it lives in
`.github/workflows/dayparting.yml` and calls the same endpoint from GitHub
Actions — free, and already wired up.

Set a deployment password before sharing the URL. The briefs contain client
budgets, targets and weaknesses, and that is Whitehart's clients' data rather
than yours.

---

## Structure

```
app/
  globals.css              shared design system (all tokens live here)
  layout.jsx               shell + nav
  page.jsx                 index
  <tool>/page.jsx          thin wrapper per tool
  api/linkedin/*           accounts, campaigns, analytics, OAuth
  api/cron/dayparting      the scheduled job
components/                the tool components
lib/
  storage.js               window.storage shim
  tools.js                 nav + index source of truth
  linkedin/auth.js         OAuth and token refresh
  linkedin/client.js       REST wrapper, retries, versioning
  linkedin/schedule.js     schedule evaluation, shared by cron and UI
config/schedules.json      dayparting rules (committed)
```

The schedule logic is deliberately shared between the cron route and the
dayparting UI, so the preview you see is exactly what the job will do.

---

## Things worth knowing

**LinkedIn versions its API monthly** (`LINKEDIN_API_VERSION`, format
`YYYYMM`) and sunsets versions after roughly a year. If calls start failing
with 400s, check the current docs before assuming a bug.

**Paused is not finished.** LinkedIn treats a paused campaign as live until
its end date, so status alone will not tell you whether something is done.

**Benchmarks are indicative.** The forecast and plan score ship with sector
figures compiled from published sources, flagged as such in the UI. Replace
them with real account data as it accumulates — that is what makes the
forecast trustworthy rather than plausible.

**The reference page ages itself.** Entries in LA-REF carry a verified date
and flag amber at six months, red at twelve. Re-check the source and bump the
date rather than removing the warning.
