/**
 * Shared helpers for reading a saved brief.
 *
 * Campaign objective is multi-select and stored comma-joined, so anything
 * that used to compare it with === has to go through here instead. One
 * parser, not four slightly different ones.
 */

export const objectivesOf = (brief) =>
  String(brief?.objective || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export const hasObjective = (brief, ...names) => {
  const list = objectivesOf(brief);
  return names.some((n) => list.includes(n));
};

/** The one to lead with when a single value is needed. */
export const primaryObjective = (brief) => objectivesOf(brief)[0] || '';

/** Where the active brief lives. */
export const CURRENT_KEY = 'brief:current';
export const SAVED_PREFIX = 'brief:saved:';

/** Filesystem-ish safety for a storage key segment. */
const slug = (v) =>
  String(v || '')
    .trim()
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

/**
 * A saved brief is identified by client AND campaign.
 *
 * Keying on the client alone meant a second brief for the same client
 * silently overwrote the first, which is the normal case: one client runs
 * several campaigns at once.
 */
export const savedKey = (brief) =>
  `${SAVED_PREFIX}${slug(brief?.client) || 'unnamed'}__${slug(brief?.campaignName) || 'untitled'}`;

/** Splits a stored key back into its two parts, for display. */
export const parseSavedKey = (key) => {
  const [client = '', campaign = ''] = String(key)
    .replace(SAVED_PREFIX, '')
    .split('__');
  return { client: client.replace(/-/g, ' '), campaign: campaign.replace(/-/g, ' ') };
};

/* ------------------------------------------------------------------ *
 * Markets, and the geo token they produce
 *
 * Whatever is typed into Markets at intake is what the naming tool uses as
 * its geo token, so nobody retypes it. Multiple markets become Global: a
 * three-region campaign named after whichever region happened to be typed
 * first is worse than no geo at all, because it reads as accurate.
 * ------------------------------------------------------------------ */

/* Comma, slash, semicolon, a line break, or the word "and". The word
 * boundaries matter: without them this splits Ireland and Poland in half. */
const MARKET_SPLIT = /\s*(?:,|\/|;|\r?\n|\band\b|&)\s*/i;

/** Every market named in the field, in the order they were typed. */
export const marketsOf = (markets) =>
  String(markets || '')
    .split(MARKET_SPLIT)
    .map((m) => m.trim())
    .filter(Boolean);

/**
 * The geo token for a name. One market uses that market, more than one
 * becomes Global. Empty markets give an empty token, which drops out of
 * the name rather than printing a placeholder.
 */
export function geoToken(markets) {
  const list = marketsOf(markets);
  if (!list.length) return '';
  return list.length === 1 ? list[0] : 'Global';
}
