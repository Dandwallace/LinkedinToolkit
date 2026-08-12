/**
 * One inline SVG per tool, keyed by route.
 *
 * Inline rather than a sprite or an icon package: there are thirteen of
 * them, they never change independently of the tool list, and they inherit
 * currentColor so the card hover states need no extra rules.
 */

const PATHS = {
  /* form on a clipboard */
  intake: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 4h6v3H9z" />
      <path d="M8.5 11.5h7M8.5 15.5h4.5" />
    </>
  ),
  /* luggage tag */
  naming: (
    <>
      <path d="M3.5 10.5V4H10l9.5 9.5-6.5 6.5z" />
      <circle cx="7.3" cy="7.3" r="1.2" />
    </>
  ),
  /* framed image */
  creative: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <circle cx="8.8" cy="10" r="1.5" />
      <path d="M4.5 17.5l4.5-4 3.5 3 3-2.5 4 3.5" />
    </>
  ),
  /* distribution curve */
  significance: (
    <>
      <path d="M3 18.5h18" />
      <path d="M4 15.5c4 0 4-9.5 8-9.5s4 9.5 8 9.5" />
      <path d="M12 6v12.5" />
    </>
  ),
  /* trend line on axes */
  reporting: (
    <>
      <path d="M4.5 4v15.5H20" />
      <path d="M7.5 15.5l4-5 3 3 5-7.5" />
    </>
  ),
  /* crosshair — going back at the same people */
  retargeting: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5" />
    </>
  ),
  /* stacked layers */
  plan: (
    <>
      <path d="M12 3l8.5 4.5L12 12 3.5 7.5z" />
      <path d="M3.5 12L12 16.5l8.5-4.5" />
      <path d="M3.5 16.5L12 21l8.5-4.5" />
    </>
  ),
  /* open book */
  reference: (
    <>
      <path d="M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2z" />
      <path d="M12 6.5v13" />
    </>
  ),
  /* clipboard, ticked */
  qa: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 4h6v3H9z" />
      <path d="M8.5 13.5l2.4 2.4 4.6-5" />
    </>
  ),
  /* clock */
  dayparting: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 6.8v5.6l3.6 2.1" />
    </>
  ),
  /* gauge */
  monitor: (
    <>
      <path d="M3.8 17.5a8.5 8.5 0 1 1 16.4 0" />
      <path d="M12 17.5l4.8-5.4" />
      <circle cx="12" cy="17.5" r="1.1" />
    </>
  ),
  /* two buildings */
  companies: (
    <>
      <path d="M4 20.5V6.4L11.5 4v16.5" />
      <path d="M11.5 10l8 2.2v8.3" />
      <path d="M2.8 20.5h18.4" />
      <path d="M7 8.5h1.5M7 12h1.5M7 15.5h1.5M15 15h1.5" />
    </>
  ),
};

const FALLBACK = (
  <>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M8 12h8" />
  </>
);

export default function ToolIcon({ route, size = 22, className = 'tool-icon' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[route] || FALLBACK}
    </svg>
  );
}
