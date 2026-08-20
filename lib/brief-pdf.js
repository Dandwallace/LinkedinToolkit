/**
 * Discovery brief → PDF.
 *
 * jsPDF is around 130 kB. It is imported dynamically inside the export
 * function so the intake page weighs the same as every other tool until
 * somebody actually asks for a PDF.
 *
 * Layout matches the on-screen form: the captured answers on the left, the
 * flags the form raised underneath, forecast last. A brief that prints in a
 * different order to the one it was filled in gets read wrong.
 */

import { loadLogo, drawLogo, LOGO_WIDTH_MM } from '@/lib/pdf-logo';

const M = 15;
const W = 210;
const RIGHT = W - M;
const COL = W - M * 2;
/* The label gutter and the width left for the value. Kept together so the
 * wrap width can never drift away from the draw position. */
const LABEL_W = 52;
const VALUE_W = COL - LABEL_W;

const NAVY = [58, 63, 122];
const GREY = [92, 95, 87];
const RED = [168, 52, 42];
const AMBER = [176, 122, 30];
const INK = [20, 20, 18];

/** Field groups, in the order the form asks for them. */
const GROUPS = [
  {
    title: 'Client & market',
    fields: [
      ['Client', 'client'],
      ['Stakeholder', 'stakeholder'],
      ['Campaign', 'campaignName'],
      ['Sector', 'sector'],
      ['Website / landing page', 'website'],
      ['Markets', 'markets'],
    ],
  },
  {
    title: 'Objective & targets',
    fields: [
      ['Objective', 'objective'],
      ['Success looks like', 'successLooksLike'],
    ],
  },
  {
    title: 'Budget & duration',
    fields: [
      ['Total budget', 'budget', '$'],
      ['Duration (months)', 'months'],
      ['Start date', 'startDate'],
      ['Planned campaigns', 'campaignCount'],
    ],
  },
  {
    title: 'Audience',
    fields: [
      ['Audience', 'audienceNotes'],
      ['Target account list', 'targetAccountList'],
    ],
  },
  {
    title: 'Tracking & systems',
    fields: [
      ['Running LinkedIn ads now', 'runningNow'],
      ['Insight Tag installed', 'insightTag'],
      ['Conversion tracking live', 'conversionTracking'],
      ['CRM', 'crm'],
      ['Lead routing agreed', 'leadRouting'],
    ],
  },
  {
    title: 'Assets & constraints',
    fields: [
      ['Landing pages ready', 'landingPages'],
      ['Assets available', 'assets'],
      ['Creative to produce', 'creatives'],
      ['Constraints', 'constraints'],
    ],
  },
];

export function buildBriefPdf(jsPDF, brief = {}, notes = [], forecast = null, logo = null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;

  const need = (mm) => {
    if (y + mm > 278) {
      doc.addPage();
      y = M + 5;
    }
  };
  const rule = (weight = 0.2, colour = [180, 178, 168]) => {
    doc.setDrawColor(...colour).setLineWidth(weight).line(M, y, RIGHT, y);
  };
  const label = (t, x = M) => {
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...GREY);
    doc.text(String(t).toUpperCase(), x, y, { charSpace: 0.4 });
  };

  /* ---- header ---- */
  y = 20;
  drawLogo(doc, logo, { x: RIGHT - LOGO_WIDTH_MM, y: y - 6 });
  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...NAVY);
  doc.text('DISCOVERY BRIEF · LINKEDIN ADS', M, y, { charSpace: 0.6 });
  y += 7;
  doc.setFont('helvetica', 'bold').setFontSize(19).setTextColor(...INK);
  doc.text(doc.splitTextToSize(brief.client || 'Unnamed client', COL - 50), M, y);

  const meta = [
    ['Captured', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })],
    brief.objective ? ['Objective', brief.objective] : null,
    ['Flags', String(notes.length)],
  ].filter(Boolean);

  /* Label above value, both right-aligned. Side by side, a long value such
   * as two objectives ran straight through its own label. */
  const META_W = 60;
  let my = y + 8;
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...GREY);
    doc.text(k.toUpperCase(), RIGHT, my, { align: 'right', charSpace: 0.3 });
    my += 3.6;
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
    const lines = doc.splitTextToSize(String(v), META_W);
    doc.text(lines, RIGHT, my, { align: 'right' });
    my += lines.length * 3.9 + 2.4;
  }
  y = Math.max(y + 6, my) + 1;
  rule(0.6, INK);
  y += 7;

  /* ---- captured answers ---- */
  for (const group of GROUPS) {
    /* Wrap every value up front, at the size they will be drawn at, so the
     * real heights are known before anything is committed to the page. */
    doc.setFont('helvetica', 'normal').setFontSize(9);
    const rows = group.fields
      .map(([lab, key, prefix]) => [lab, formatValue(brief[key], prefix)])
      .filter(([, v]) => v)
      .map(([lab, v]) => ({ lab, lines: doc.splitTextToSize(v, VALUE_W) }));
    if (!rows.length) continue;

    const rowHeight = (r) => Math.max(5, r.lines.length * 4) + 2.5 + 5;
    /* A heading must never be the last thing on a page, so it is sized
     * together with the first row it introduces. */
    need(12 + rowHeight(rows[0]));
    label(group.title);
    y += 3.5;
    rule(0.4, INK);
    y += 4.5;

    for (const r of rows) {
      need(rowHeight(r));
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
      doc.text(r.lab, M, y);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
      doc.text(r.lines, M + LABEL_W, y);
      y += Math.max(5, r.lines.length * 4) + 2.5;
      rule(0.15, [214, 212, 200]);
      /* Clears the rule above rather than sitting on it. */
      y += 5;
    }
    y += 4;
  }

  /* ---- flags ---- */
  if (notes.length) {
    need(22);
    label('What this implies');
    y += 3.5;
    rule(0.4, INK);
    y += 5.5;

    for (const n of notes) {
      const colour = n.level === 'blocker' ? RED : n.level === 'action' ? NAVY : AMBER;
      doc.setFont('helvetica', 'normal').setFontSize(8);
      const bodyLines = doc.splitTextToSize(n.body, COL - 6);
      need(bodyLines.length * 3.6 + 10);

      doc.setFillColor(...colour);
      doc.rect(M, y - 3.2, 1.2, bodyLines.length * 3.6 + 5.5, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...colour);
      doc.text(String(n.level).toUpperCase(), M + 4, y, { charSpace: 0.4 });
      doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
      doc.text(doc.splitTextToSize(n.title, COL - 4), M + 4, y + 4.4);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(60, 60, 55);
      doc.text(bodyLines, M + 4, y + 9);
      y += bodyLines.length * 3.6 + 13;
    }
    y += 2;
  }

  /* ---- forecast ---- */
  if (forecast) {
    need(40);
    label('Forecast at sector benchmark');
    y += 3.5;
    rule(0.4, INK);
    y += 5;

    const rows = [
      ['Monthly budget', money(forecast.monthly)],
      ['Daily', money(forecast.daily)],
      ['Impressions / month', Math.round(forecast.impressions).toLocaleString('en-GB')],
      ['Clicks / month', `${Math.round(forecast.clicks).toLocaleString('en-GB')} at ${money(forecast.cpc)} CPC`],
      ['Leads / month', `${Math.floor(forecast.leads).toLocaleString('en-GB')} at ${money(forecast.cpl)} CPL`],
    ];
    for (const [k, v] of rows) {
      need(6);
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GREY);
      doc.text(k, M, y);
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
      doc.text(v, RIGHT, y, { align: 'right' });
      y += 4.4;
      rule(0.15, [214, 212, 200]);
      y += 2.6;
    }
    y += 3;
    doc.setFont('helvetica', 'italic').setFontSize(7).setTextColor(...GREY);
    doc.text(
      doc.splitTextToSize(
        'Indicative sector benchmarks, not a promise. Replace with real account data as it accumulates.',
        COL
      ),
      M,
      y
    );
  }

  /* ---- footer ---- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(180, 178, 168).setLineWidth(0.2).line(M, 288, RIGHT, 288);
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GREY);
    doc.text(
      `${brief.client || 'Unnamed client'} · discovery brief · captured ${new Date().toLocaleDateString('en-GB')}`,
      M,
      291.5
    );
    doc.text(`${p} / ${pages}`, RIGHT, 291.5, { align: 'right' });
  }

  return doc;
}

/** Builds the PDF. jsPDF is fetched only at this point. */
async function renderBriefPdf(brief, notes, forecast) {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadLogo()]);
  return buildBriefPdf(jsPDF, brief, notes, forecast, logo);
}

/** Builds and saves the PDF. */
export async function downloadBriefPdf(brief, notes = [], forecast = null) {
  const doc = await renderBriefPdf(brief, notes, forecast);
  const name = [brief.client || 'Discovery brief', new Date().toISOString().slice(0, 10)]
    .filter(Boolean)
    .join(', ')
    .replace(/[^\w\s,-]/g, '');
  doc.save(`${name}.pdf`);
  return doc;
}

/**
 * Builds the same PDF as a Blob, for posting to the server.
 *
 * jsPDF only runs in a browser, so the file is made here and uploaded
 * rather than rebuilt server-side. That also guarantees the PDF attached to
 * the Monday item is byte for byte the one the user could have downloaded.
 */
export async function briefPdfBlob(brief, notes = [], forecast = null) {
  const doc = await renderBriefPdf(brief, notes, forecast);
  return doc.output('blob');
}

/* ------------------------------------------------------------------ */

function formatValue(v, prefix) {
  if (v == null) return '';
  if (Array.isArray(v)) {
    /* Creative picks are objects; everything else is a plain string list. */
    return v
      .map((x) => (x && typeof x === 'object' ? `${x.quantity} x ${x.format}` : x))
      .join(', ');
  }
  const s = String(v).trim();
  if (!s) return '';
  if (prefix && /^\d+(\.\d+)?$/.test(s)) return prefix + Number(s).toLocaleString('en-GB');
  return s;
}

function money(n) {
  return '$' + Math.round(n || 0).toLocaleString('en-GB');
}
