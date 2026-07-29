/**
 * Campaign health assessment.
 *
 * Pure functions over rows of daily analytics, so the logic can be tested
 * without touching LinkedIn. Rows use the same shape the analytics route and
 * the Sheets sync produce:
 *
 *   { date, campaignId, campaign, impressions, clicks, spend, conversions, leads }
 *
 * Design principle throughout: a daily email that looks the same every day
 * stops being read. Every check here either fires for a reason or stays
 * silent — nothing reports "still fine" at issue level.
 */

const DAY = 86400000;
const PRACTICAL_DAILY = 75;   // the B2B floor, not LinkedIn's £10 technical minimum
const MIN_DAILY = 10;

const iso = (d) => d.toISOString().slice(0, 10);
const sum = (rows, key) => rows.reduce((n, r) => n + Number(r[key] ?? 0), 0);

/** Rows falling on a given ISO date. */
const on = (rows, date) => rows.filter((r) => r.date === date);

/** Rows in the [from, to) window, both ISO dates. */
const between = (rows, from, to) => rows.filter((r) => r.date >= from && r.date < to);

function rate(rows) {
  const impressions = sum(rows, 'impressions');
  const clicks = sum(rows, 'clicks');
  const spend = sum(rows, 'spend');
  const leads = sum(rows, 'leads');
  return {
    impressions, clicks, spend, leads,
    conversions: sum(rows, 'conversions'),
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
    cpl: leads ? spend / leads : 0,
  };
}

/**
 * Assesses one account for one morning.
 *
 * `campaigns` carries current status so dayparting is not mistaken for
 * failure — a campaign this app paused last night is PAUSED, and silence from
 * it is expected rather than alarming.
 */
export function assessAccount({ client, rows, campaigns = [], monthlyCap = 0, now = new Date() }) {
  const issues = [];
  const yesterday = iso(new Date(now.getTime() - DAY));
  const weekStart = iso(new Date(now.getTime() - 7 * DAY));
  const priorStart = iso(new Date(now.getTime() - 14 * DAY));

  const yRows = on(rows, yesterday);
  const week = between(rows, weekStart, iso(now));
  const prior = between(rows, priorStart, weekStart);

  const y = rate(yRows);
  const w = rate(week);
  const p = rate(prior);

  const statusById = new Map(campaigns.map((c) => [String(c.id), c.status]));
  const activeIds = campaigns.filter((c) => c.status === 'ACTIVE').map((c) => String(c.id));

  /* ---- the silent one: live campaign, nothing delivered ---- */
  const dark = activeIds.filter((id) => {
    const r = yRows.find((x) => String(x.campaignId) === id);
    return !r || r.impressions === 0;
  });
  if (dark.length) {
    const names = dark.map((id) => campaigns.find((c) => String(c.id) === id)?.name || id);
    issues.push({
      level: 'urgent',
      title: `${dark.length} live campaign${dark.length === 1 ? '' : 's'} delivered nothing yesterday`,
      detail:
        `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. ` +
        'Usually a declined card, a rejected ad, or an audience that has collapsed below the delivery threshold. ' +
        'Nothing about this shows up as an error in Campaign Manager.',
    });
  }

  /* ---- whole account dark, and nothing paused to explain it ---- */
  if (activeIds.length && y.spend === 0 && dark.length === activeIds.length) {
    issues.push({
      level: 'urgent',
      title: 'No spend at all yesterday',
      detail: 'Every active campaign is silent. Check billing first — a declined card stops everything at once.',
    });
  }

  /* ---- budget pacing, pro-rated ---- */
  if (monthlyCap > 0) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const elapsed = now.getUTCDate() / daysInMonth;
    const mtd = sum(between(rows, iso(monthStart), iso(now)), 'spend');
    const expected = monthlyCap * elapsed;
    const pace = expected ? mtd / expected : 0;
    const projected = elapsed ? mtd / elapsed : 0;

    if (pace > 1.15) {
      issues.push({
        level: 'warn',
        title: `Pacing ${Math.round((pace - 1) * 100)}% hot`,
        detail: `${money(mtd)} spent, ${money(expected)} expected by now. On track for ${money(projected)} against a ${money(monthlyCap)} cap.`,
      });
    } else if (pace < 0.7 && now.getUTCDate() > 7) {
      issues.push({
        level: 'warn',
        title: `Pacing ${Math.round((1 - pace) * 100)}% cold`,
        detail: `On track for ${money(projected)}, leaving roughly ${money(monthlyCap - projected)} unspent. Usually an audience or bid ceiling rather than a choice.`,
      });
    }
  }

  /* ---- spend spike against the trailing week ---- */
  const spendDays = week.reduce((map, r) => {
    map.set(r.date, (map.get(r.date) || 0) + Number(r.spend ?? 0));
    return map;
  }, new Map());
  /* Only non-zero days, so dayparted weekends do not drag the mean down and
   * make every Monday look like a spike. */
  const live = [...spendDays.values()].filter((v) => v > 0);
  if (live.length >= 3 && y.spend > 0) {
    const mean = live.reduce((n, v) => n + v, 0) / live.length;
    if (y.spend > mean * 2) {
      issues.push({
        level: 'warn',
        title: `Spend doubled yesterday`,
        detail: `${money(y.spend)} against a ${money(mean)} recent daily average. Check for a budget or bid change nobody flagged.`,
      });
    }
  }

  /* ---- cost per lead drifting ---- */
  if (w.leads >= 5 && p.leads >= 5 && p.cpl > 0) {
    const change = (w.cpl - p.cpl) / p.cpl;
    if (change > 0.4) {
      issues.push({
        level: 'warn',
        title: `Cost per lead up ${Math.round(change * 100)}%`,
        detail: `${money(w.cpl)} this week against ${money(p.cpl)} last. Creative fatigue and audience saturation both look like this.`,
      });
    }
  }

  /* ---- lead generation that has stopped generating leads ---- */
  if (p.leads >= 5 && w.leads === 0 && w.spend > 0) {
    issues.push({
      level: 'urgent',
      title: 'No leads at all this week',
      detail: `${money(w.spend)} spent and nothing captured, against ${p.leads} leads the week before. Check the form still submits and the tag still fires.`,
    });
  }

  /* ---- creative fatigue ---- */
  if (w.impressions > 2000 && p.impressions > 2000 && p.ctr > 0) {
    const change = (w.ctr - p.ctr) / p.ctr;
    if (change < -0.3) {
      issues.push({
        level: 'note',
        title: `Click-through down ${Math.round(-change * 100)}%`,
        detail: `${w.ctr.toFixed(2)}% this week against ${p.ctr.toFixed(2)}% last. Worth rotating creative before cost follows.`,
      });
    }
  }

  /* ---- campaigns funded below the point of usefulness ---- */
  const thin = campaigns.filter((c) => {
    if (c.status !== 'ACTIVE' || !c.dailyBudget) return false;
    return Number(c.dailyBudget) < MIN_DAILY;
  });
  if (thin.length) {
    issues.push({
      level: 'note',
      title: `${thin.length} campaign${thin.length === 1 ? '' : 's'} under the £${MIN_DAILY}/day floor`,
      detail: 'Below this, delivery is erratic and nothing accumulates enough data to optimise.',
    });
  }

  const order = { urgent: 0, warn: 1, note: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);

  return { client, yesterday: y, week: w, prior: p, issues, campaignCount: activeIds.length };
}

function money(n) {
  return '£' + Math.round(n || 0).toLocaleString('en-GB');
}

/** Subject line carries the signal, so triage happens from the notification. */
export function subjectFor(accounts) {
  const urgent = accounts.reduce((n, a) => n + a.issues.filter((i) => i.level === 'urgent').length, 0);
  const warn = accounts.reduce((n, a) => n + a.issues.filter((i) => i.level === 'warn').length, 0);
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  if (urgent) {
    return `LinkedIn · ${urgent} thing${urgent === 1 ? '' : 's'} need${urgent === 1 ? 's' : ''} attention — ${date}`;
  }
  if (warn) return `LinkedIn · ${warn} to look at — ${date}`;
  return `LinkedIn · all healthy — ${date}`;
}

export { money, rate };
