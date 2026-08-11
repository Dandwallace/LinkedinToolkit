/**
 * Dayparting schedule evaluation.
 *
 * Shared by the cron route and the browser UI, so what you see in the
 * preview is exactly what the scheduled job will do. Dependency-free: uses
 * Intl to resolve "what time is it right now in Europe/London" rather than
 * pulling in a date library.
 */

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localNow(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const weekday = get('weekday');
  if (!(weekday in DAY_INDEX)) throw new Error(`Bad timezone "${timezone}"`);
  return { day: DAY_INDEX[weekday], minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time "${hhmm}", expected HH:MM`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) throw new Error(`Invalid time "${hhmm}"`);
  return h * 60 + mm;
}

/**
 * True if `now` sits inside any window. Windows crossing midnight
 * (22:00–02:00) are supported: they run from `start` on a listed day through
 * `end` on the following one.
 */
export function isWithinWindows(windows, timezone, now = new Date()) {
  const { day, minutes } = localNow(timezone, now);
  for (const w of windows) {
    const start = toMinutes(w.start);
    const end = toMinutes(w.end);
    const days = w.days ?? [1, 2, 3, 4, 5];
    if (start <= end) {
      if (days.includes(day) && minutes >= start && minutes < end) return true;
    } else {
      if (days.includes(day) && minutes >= start) return true;
      const yesterday = (day + 6) % 7;
      if (days.includes(yesterday) && minutes < end) return true;
    }
  }
  return false;
}

export function resolveDesiredStates(config, now = new Date()) {
  const out = [];
  for (const rule of config.schedules ?? []) {
    if (rule.enabled === false) continue;
    const timezone = rule.timezone || config.defaultTimezone || 'Europe/London';
    const active = isWithinWindows(rule.windows, timezone, now);
    for (const campaignId of rule.campaignIds ?? []) {
      out.push({
        accountId: String(rule.accountId),
        campaignId: String(campaignId),
        desired: active ? 'ACTIVE' : 'PAUSED',
        label: rule.label || `account ${rule.accountId}`,
        timezone,
      });
    }
  }
  return out;
}

export function validateConfig(config) {
  const errors = [];
  if (!Array.isArray(config?.schedules)) return ['config.schedules must be an array'];
  config.schedules.forEach((rule, i) => {
    const where = `schedules[${i}]`;
    if (!rule.accountId) errors.push(`${where}.accountId is required`);
    if (!Array.isArray(rule.campaignIds) || !rule.campaignIds.length) {
      errors.push(`${where}.campaignIds must be a non-empty array`);
    }
    if (!Array.isArray(rule.windows) || !rule.windows.length) {
      errors.push(`${where}.windows must be a non-empty array`);
    } else {
      rule.windows.forEach((w, j) => {
        try { toMinutes(w.start); toMinutes(w.end); }
        catch (e) { errors.push(`${where}.windows[${j}]: ${e.message}`); }
        if (w.days && w.days.some((d) => d < 0 || d > 6)) {
          errors.push(`${where}.windows[${j}].days must be 0–6 (0 = Sunday)`);
        }
      });
    }
    const tz = rule.timezone || config.defaultTimezone || 'Europe/London';
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); }
    catch { errors.push(`${where}.timezone "${tz}" is not a valid IANA timezone`); }
  });
  return errors;
}
