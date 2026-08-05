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

const M = 15;
const W = 210;
const RIGHT = W - M;
const COL = W - M * 2;

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
      ['Sector', 'sector'],
      ['Website', 'website'],
      ['Markets', 'markets'],
    ],
  },
  {
    title: 'Objective & targets',
    fields: [
      ['Objective', 'objective'],
      ['Success looks like', 'successLooksLike'],
      ['Target leads / month', 'targetLeads'],
      ['Average deal size', 'dealSize', '£'],
    ],
  },
  {
    title: 'Budget & duration',
    fields: [
      ['Total budget', 'budget', '£'],
      ['Duration (months)', 'months'],
      ['Start date', 'startDate'],
      ['Planned campaigns', 'campaignCount'],
    ],
  },
  {
    title: 'Audience',
    fields: [
      ['Job titles & functions', 'jobTitles'],
      ['Seniority', 'seniority'],
      ['Company size', 'companySize'],
      ['Est. audience size', 'audienceSize'],
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
      ['Constraints', 'constraints'],
    ],
  },
];

export function buildBriefPdf(jsPDF, brief = {}, notes = [], forecast = null) {
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

  let my = y - 5;
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...GREY);
    doc.text(k.toUpperCase(), RIGHT - 42, my, { charSpace: 0.3 });
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
    doc.text(doc.splitTextToSize(String(v), 42), RIGHT, my, { align: 'right' });
    my += 4.6;
  }
  y = Math.max(y + 6, my) + 1;
  rule(0.6, INK);
  y += 7;

  /* ---- captured answers ---- */
  for (const group of GROUPS) {
    const rows = group.fields
      .map(([lab, key, prefix]) => [lab, formatValue(brief[key], prefix)])
      .filter(([, v]) => v);
    if (!rows.length) continue;

    need(14 + rows.length * 5);
    label(group.title);
    y += 3.5;
    rule(0.4, INK);
    y += 4.5;

    for (const [lab, value] of rows) {
      const lines = doc.splitTextToSize(value, COL - 52);
      need(lines.length * 3.6 + 5);
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
      doc.text(lab, M, y);
      doc.setFontSize(9).setTextColor(...INK);
      doc.text(lines, M + 52, y);
      y += Math.max(5, lines.length * 3.9) + 1;
      rule(0.15, [214, 212, 200]);
      y += 3;
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
      const bodyLines = doc.splitTextToSize(n.body, COL - 4);
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
      ...(forecast.pipeline ? [['Pipeline value', money(forecast.pipeline)]] : []),
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

/** Builds and saves the PDF. jsPDF is fetched only at this point. */
export async function downloadBriefPdf(brief, notes = [], forecast = null) {
  const { jsPDF } = await import('jspdf');
  const doc = buildBriefPdf(jsPDF, brief, notes, forecast);
  const name = [brief.client || 'Discovery brief', new Date().toISOString().slice(0, 10)]
    .filter(Boolean)
    .join(' — ')
    .replace(/[^\w\s—-]/g, '');
  doc.save(`${name}.pdf`);
  return doc;
}

/* ------------------------------------------------------------------ */

function formatValue(v, prefix) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  const s = String(v).trim();
  if (!s) return '';
  if (prefix && /^\d+(\.\d+)?$/.test(s)) return prefix + Number(s).toLocaleString('en-GB');
  return s;
}

function money(n) {
  return '£' + Math.round(n || 0).toLocaleString('en-GB');
}
