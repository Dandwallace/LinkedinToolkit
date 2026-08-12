/** Single source of truth for navigation and the index page.
 *
 * Order is the order of work: capture the brief, name the campaigns, brief
 * the creative, then the analysis tools, then QA last because it is the
 * gate you pass through immediately before launch.
 */
export const TOOLS = [
  {
    "route": "intake",
    "name": "Intake",
    "blurb": "Discovery capture with live flags"
  },
  {
    "route": "naming",
    "name": "Naming",
    "blurb": "Campaign names and tagged URLs"
  },
  {
    "route": "creative",
    "name": "Creative",
    "blurb": "Brief the design team, export PDF"
  },
  {
    "route": "significance",
    "name": "Significance",
    "blurb": "Is the difference real yet"
  },
  {
    "route": "retargeting",
    "name": "Retargeting",
    "blurb": "Pool fill times and sequencing"
  },
  {
    "route": "plan",
    "name": "Plan score",
    "blurb": "Score a plan before building it"
  },
  {
    "route": "reference",
    "name": "Best practices",
    "blurb": "Sourced best practice, with dates"
  },
  {
    "route": "qa",
    "name": "QA",
    "blurb": "Pre-launch checks"
  }
];

export const API_TOOLS = [
  /* Reporting sits here because its second mode pulls straight from the API.
   * The upload mode still works without credentials. */
  { route: 'reporting', name: 'Reporting', blurb: 'From an export, or from the API' },
  { route: 'dayparting', name: 'Dayparting', blurb: 'Schedule delivery hours' },
  { route: 'monitor', name: 'Monitor', blurb: 'Budget pacing and frequency' },
  { route: 'companies', name: 'Companies', blurb: 'Who actually saw the ads' },
];

/** Not tools. The saved-brief switcher and the connection status page,
 *  which sit apart from the two groups at the end of the nav. */
export const BRIEFS = { route: 'briefs', name: 'Briefs' };
export const SETUP = { route: 'setup', name: 'Setup' };
