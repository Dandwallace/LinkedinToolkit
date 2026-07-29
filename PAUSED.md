# Paused: scheduled jobs

Everything that talks to LinkedIn is built and tested but **not scheduled**,
because API access is not in place yet.

## What is paused

| | |
|---|---|
| Dayparting | `.github/workflows/dayparting.yml` — schedule commented out |
| Sheets sync | removed from `vercel.json` |
| Morning brief | removed from `vercel.json` |
| Spend alarm | removed from `vercel.json` |

Nothing runs on a timer. The pages and API routes are all still there and
report honestly that they are not connected, rather than erroring.

## What still works

The twelve planning tools. They need no credentials and are unaffected:
briefs, intake, forecast, budget, naming, QA, creative, significance, CSV
analysis, retargeting, plan score, reference.

## To resume

Once the LinkedIn app is approved and `LINKEDIN_REFRESH_TOKEN` is set:

**1.** Put the crons back in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/sync-sheets",   "schedule": "0 6 * * *" },
    { "path": "/api/cron/morning-brief", "schedule": "0 7 * * *" }
  ]
}
```

**2.** Uncomment the two `schedule:` lines in
`.github/workflows/dayparting.yml`, and add the `SITE_URL` and `CRON_SECRET`
repository secrets.

**3.** Check each one by hand before trusting the timer:

```
/api/google/check
/api/cron/sync-sheets?dry=1
/api/cron/dayparting?dry=1
/api/cron/morning-brief?preview=1
```

None of those change a campaign or send anything.

## Also outstanding

Page admin on the Whitehart Company Page. Ad account access and Page admin
are separate permissions granted by different people — having the first does
not imply the second, and the developer app has to be created against the
Page. Ask whoever set the Page up for **super admin**, not content admin.
