/** Single source of truth for navigation and the index page.
 *
 * Order is the order of work: capture the brief, name the campaigns, brief
 * the creative, then the analysis tools, then QA last because it is the
 * gate you pass through immediately before launch.
 */
export const TOOLS = [
  {
    "route": "intake",
    "form": "LA-01",
    "name": "Intake",
    "blurb": "Discovery capture with live flags"
  },
  {
    "route": "naming",
    "form": "LA-04",
    "name": "Naming",
    "blurb": "Campaign names and tagged URLs"
  },
  {
    "route": "creative",
    "form": "LA-06",
    "name": "Creative",
    "blurb": "Brief the design team, export PDF"
  },
  {
    "route": "significance",
    "form": "LA-07",
    "name": "Significance",
    "blurb": "Is the difference real yet"
  },
  {
    "route": "reporting",
    "form": "LA-08",
    "name": "Reporting",
    "blurb": "From an export, or from the API"
  },
  {
    "route": "retargeting",
    "form": "LA-09",
    "name": "Retargeting",
    "blurb": "Pool fill times and sequencing"
  },
  {
    "route": "plan",
    "form": "LA-10",
    "name": "Plan score",
    "blurb": "Score a plan before building it"
  },
  {
    "route": "reference",
    "form": "LA-REF",
    "name": "Best practices",
    "blurb": "Sourced best practice, with dates"
  },
  {
    "route": "qa",
    "form": "LA-05",
    "name": "QA",
    "blurb": "Pre-launch checks"
  }
];

export const API_TOOLS = [
  { route: 'dayparting', form: 'LA-11', name: 'Dayparting', blurb: 'Schedule delivery hours' },
  { route: 'monitor', form: 'LA-13', name: 'Monitor', blurb: 'Budget pacing and frequency' },
  { route: 'companies', form: 'LA-14', name: 'Companies', blurb: 'Who actually saw the ads' },
];

/** Not a tool — the connection status page. Sits apart in the nav. */
export const SETUP = { route: 'setup', name: 'Setup' };
