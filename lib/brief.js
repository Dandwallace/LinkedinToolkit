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
export const clientKey = (client) => `brief:client:${client}`;
