# Getting this online

Written assuming you have not used GitHub or deployed a site before. It takes
about half an hour, most of which is waiting.

---

## What the pieces actually are

**Git** is the version control system. It takes a snapshot of every file each
time you "commit", so you can see what changed, when, and go back to any
earlier state. It runs on your machine.

**GitHub** is where those snapshots get stored online. Think of it as the
remote copy plus a web interface for browsing history.

**Vercel** takes the code from GitHub and runs it as a live website. Every
time you push a change to GitHub, Vercel rebuilds and redeploys automatically.

So the chain is: *edit on your laptop → commit → push to GitHub → Vercel
deploys*. You never upload files by hand.

---

## Why Vercel rather than Netlify

Netlify is fine for static sites. This is not one — it has server-side API
routes and scheduled jobs, and Next.js is made by Vercel, so it is the native
home. On Netlify the API routes need a compatibility layer and `vercel.json`
does nothing at all; you would have to rewrite the scheduling.

Both have free tiers. Use Vercel.

---

## One-off setup

**Install Git** — [git-scm.com/downloads](https://git-scm.com/downloads).
On a Mac it may already be there; type `git --version` in Terminal to check.

**Make a GitHub account** at [github.com](https://github.com), then tell Git
who you are:

```bash
git config --global user.name "Daniel Wallace"
git config --global user.email "you@example.com"
```

---

## Push the code

From inside the project folder:

```bash
git init
git add .
git commit -m "Initial commit"
```

That is your first snapshot, stored locally. Now create an empty **private**
repository on GitHub — do not tick "add a README" — and it will show you two
lines to run. They look like:

```bash
git remote add origin https://github.com/YOURNAME/linkedin-ads-toolkit.git
git push -u origin main
```

Refresh the GitHub page and the files are there.

**Private, not public.** No client data is in the repo, but the intake form
and plan score encode how you assess and price an engagement. That is your
method — no reason to publish it.

**Under your personal account, not a Whitehart organisation.** Two reasons:
you can always transfer it later, and Vercel's free tier will not deploy from
a repository owned by an organisation. Personal account keeps the free path
open.

---

## Deploy

1. Sign in to [vercel.com](https://vercel.com) with GitHub.
2. **Add New → Project**, pick the repository, and press Deploy. It will
   detect Next.js on its own — change nothing.
3. Two or three minutes later you have a live URL ending `.vercel.app`.

Twelve of the sixteen tools work immediately. The four LinkedIn ones will say
they are not connected, which is correct.

### Put a password on it

**Settings → Deployment Protection → Password Protection.**

Do this before sending the link to anyone. The briefs hold client budgets,
targets and weaknesses — that is Whitehart's clients' data, not yours.

Password protection is a Pro feature. If you stay on the free tier, keep the
URL to yourself and treat it as a personal tool until that changes.

---

## Environment variables

When you have LinkedIn credentials: **Settings → Environment Variables**, add
the keys from `.env.example`, then **Deployments → ⋯ → Redeploy**. Variables
only apply to builds made after they were added.

Never put these in the code. They are in `.gitignore` for a reason — the
refresh token grants write access to a live ad account.

---

## Scheduled jobs

The spend alarm runs daily through Vercel and needs nothing extra.

Dayparting needs to run hourly, and **Vercel's free tier only allows
once-daily crons** — anything more frequent fails at deploy time. So it runs
from GitHub Actions instead, which is free and already in the repo at
`.github/workflows/dayparting.yml`.

To switch it on, add two repository secrets under
**Settings → Secrets and variables → Actions**:

| Name | Value |
|---|---|
| `SITE_URL` | your `https://….vercel.app` address |
| `CRON_SECRET` | the same string as in your Vercel environment variables |

Then open the **Actions** tab and press *Run workflow* to test it by hand
before trusting the schedule.

Worth knowing: scheduled GitHub Actions can run late under load, sometimes by
five or ten minutes. For business-hours dayparting that is harmless. Also note
Vercel's free tier caps function execution at 10 seconds — fine for a couple
of accounts, but if the job starts timing out, that is why.

---

## A custom domain

Buy one anywhere — Cloudflare sells at cost, around £10 a year. In Vercel:
**Settings → Domains → Add**, type the domain, and it shows you the DNS record
to create at your registrar. Takes a few minutes to propagate. HTTPS is
automatic.

---

## Changing things later

The everyday loop is three commands:

```bash
git add .
git commit -m "What changed"
git push
```

Vercel redeploys on its own. If a change breaks the site, **Deployments →
find the last good one → Instant Rollback**, and you are back in seconds.

### Working with Claude

**Claude Code** is the right tool for this. It runs in your terminal inside
the project folder, reads the files, makes edits across several at once, and
can commit for you. Describe what you want changed and it works directly on
the code rather than you copying blocks back and forth.

Installed with:

```bash
npm install -g @anthropic-ai/claude-code
```

Then run `claude` from inside the project folder.

For small tweaks, pasting a single file into a chat and pasting the answer
back works fine. For anything touching several files, Claude Code is worth the
setup.

### The habit worth forming

Commit small and often, with messages that say what changed rather than
"update". Six months from now, `git log` is the only record of why something
is the way it is — and you will want it, because a lot of the thresholds in
these tools are judgement calls that looked obvious at the time.

---

## If something breaks

**Build fails on Vercel** — the log names the file and line. Nine times in ten
it is a typo in the last thing you edited.

**Site loads but a tool is blank** — open the browser console (F12). React
errors appear there, not in the Vercel log.

**LinkedIn tools say not connected** — check the environment variables are
set, and that you redeployed after adding them.

**Dayparting does nothing** — run the workflow by hand from the Actions tab
and read the output. It will tell you whether it is the secret, the URL, or
the schedule config.
