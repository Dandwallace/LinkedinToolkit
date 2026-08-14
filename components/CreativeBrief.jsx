'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { loadLogo, drawLogo, LOGO_WIDTH_MM } from '@/lib/pdf-logo';
import { objectivesOf } from '@/lib/brief';
import {
  FORM_LIMITS,
  MAX_FIELDS,
  BEST_PRACTICE_FIELDS,
  MAX_QUESTIONS,
  MAX_CONSENTS,
  MAX_HIDDEN,
  DEFAULT_FIELDS,
  FIELD_GROUPS,
  QUESTION_TYPES,
  CTA_OPTIONS,
  DELIVERY_OPTIONS,
  DOCUMENT_SPEC,
  DELIVERY_WARNING,
  PRIVACY_NOTE,
  EMPTY_FORM,
  fieldCount,
  formIssues,
} from '@/lib/leadgen-form';

/* ------------------------------------------------------------------ *
 * Format specifications — verified against published 2026 spec guides.
 * ------------------------------------------------------------------ */
const FORMATS = {
  'Single image': {
    fields: [
      { key: 'intro', label: 'Introductory text', limit: 600, visible: 150, rows: 4 },
      { key: 'headline', label: 'Headline', limit: 200, visible: 70, rows: 2 },
    ],
    asset: { ratios: ['1:1 at 1200×1200 (recommended)', '1.91:1 at 1200×627', '4:5 at 720×900 (mobile only)'], size: '5 MB', types: 'JPG, PNG, GIF (non-animated)' },
    notes: [
      'Square delivers cleanly on desktop and mobile, the safest single-asset standard.',
      'There is no description to write. The field exists in Campaign Manager but does not render in the feed, so it is internal only.',
      'Vertical 4:5 will not show on desktop at all.',
      'PNG for text overlays, logos and flat colour. JPG for photography.',
    ],
    preview: 'feed',
  },
  Carousel: {
    fields: [
      { key: 'intro', label: 'Introductory text', limit: 255, visible: 150, rows: 4 },
      { key: 'headline', label: 'Card headline', limit: 45, visible: 45, rows: 2, dynamic: 'carousel' },
    ],
    asset: { ratios: ['1:1 at 1080×1080 per card (max 4320×4320)'], size: '10 MB per card', types: 'JPG, PNG', extra: '2–10 cards' },
    notes: [
      'Card headline drops from 45 to 30 characters if the CTA points at a Lead Gen Form.',
      'No description field on cards, so the headline is all the text there is.',
      'One form for the whole carousel. A different form per card is not supported.',
      'The CTA button appears only on the final card.',
    ],
    preview: 'feed',
  },
  Video: {
    fields: [
      { key: 'intro', label: 'Introductory text', limit: 600, visible: 150, rows: 4 },
      { key: 'headline', label: 'Headline', limit: 200, visible: 70, rows: 2 },
    ],
    asset: { ratios: ['16:9 at 1920×1080', '1:1 at 1080×1080', '4:5 at 1080×1350', '9:16 at 1080×1920 (mobile only)'], size: '200 MB', types: 'MP4 (preferred), MOV, ASF', extra: '3 seconds to 30 minutes' },
    notes: [
      '15–30 seconds performs best for awareness. Longer suits thought leadership.',
      'The 200 MB cap is far tighter than organic video, which allows 5 GB.',
      'Supply an SRT caption file, because most feed viewing is silent.',
    ],
    preview: 'feed',
  },
  Document: {
    fields: [
      { key: 'intro', label: 'Introductory text', limit: 600, visible: 150, rows: 4 },
      { key: 'headline', label: 'Headline', limit: 200, visible: 70, rows: 2 },
    ],
    asset: { ratios: ['Portrait, landscape or square. Portrait uses the most feed space'], size: '100 MB', types: 'PDF, DOC, DOCX, PPT, PPTX', extra: 'Up to 300 pages' },
    notes: [
      'Ungated, members can read the whole document in the feed.',
      'Gated behind a Lead Gen Form, they see a preview of the first pages, five by default, and fill the form to get the rest. Put the argument in those pages and the payoff behind the form.',
      'A Lead Gen Form cannot be attached to a single-page document, because at least one page has to remain as the preview.',
      'Front-load the value. Page one is the only page guaranteed to be seen.',
      'The visual is the document preview itself. There is no form banner image: that is Message Ads, which take a 300x250.',
      'Read-depth is reported, so the document can be segmented on afterwards.',
    ],
    preview: 'feed',
  },
  'Thought leader': {
    fields: [{ key: 'intro', label: 'Post text', limit: 3000, visible: 150, rows: 6 }],
    asset: { ratios: ['Inherits whatever the original post used'], size: 'As per the underlying post', types: 'Sponsors an existing organic post from a named member', extra: 'Requires that member to grant permission' },
    notes: [
      'No separate headline field, so the post text is the whole ad.',
      'Do not over-produce it. The performance comes from it reading as genuine.',
      'Typically clears a fraction of the cost-per-click of polished brand creative.',
    ],
    preview: 'feed',
  },
  Spotlight: {
    fields: [
      { key: 'headline', label: 'Headline', limit: 50, visible: 50, rows: 2 },
      { key: 'description', label: 'Description', limit: 70, visible: 70, rows: 2 },
      { key: 'cta', label: 'CTA text', limit: 18, visible: 18, rows: 1 },
    ],
    asset: { ratios: ['Logo at 100×100'], size: '2 MB', types: 'JPG, PNG', extra: 'Desktop only' },
    notes: [
      "Pulls the viewer's own profile photo alongside the client logo, so it reads as personalised.",
      'Desktop only, so it is worthless against a mobile-heavy audience.',
    ],
    preview: 'rail',
  },
  'Text ad': {
    fields: [
      { key: 'headline', label: 'Headline', limit: 25, visible: 25, rows: 1 },
      { key: 'description', label: 'Description', limit: 75, visible: 75, rows: 2 },
    ],
    asset: { ratios: ['Thumbnail at 100×100'], size: '2 MB', types: 'JPG, PNG', extra: 'Desktop only' },
    notes: [
      'The 25-character headline is the real constraint, not the image.',
      'Cheapest inventory on the platform. Supporting reach, not a lead driver.',
    ],
    preview: 'rail',
  },
  'Message ad': {
    fields: [
      { key: 'subject', label: 'Subject line', limit: 60, visible: 60, rows: 1 },
      { key: 'intro', label: 'Message body', limit: 1500, visible: 1500, rows: 8 },
      { key: 'cta', label: 'CTA button', limit: 20, visible: 20, rows: 1 },
    ],
    asset: { ratios: ['Banner at 300×250 (optional, desktop only)'], size: '2 MB', types: 'JPG, PNG, GIF (non-animated)', extra: 'Up to 3 links and 10 emojis' },
    notes: [
      'Send from a named person, not the company page. It materially outperforms.',
      'EU members must have opted in before they can receive this at all.',
      'Capped at 1–2 messages per recipient every 30 days.',
    ],
    preview: 'message',
  },
  'Conversation ad': {
    fields: [
      { key: 'intro', label: 'Opening message', limit: 500, visible: 500, rows: 6 },
      { key: 'cta', label: 'CTA button', limit: 25, visible: 25, rows: 1, note: 'Up to five buttons per layer' },
    ],
    asset: { ratios: ['Banner at 300×250 (optional, desktop only)'], size: '2 MB', types: 'JPG, PNG', extra: 'Branching paths, up to 5 buttons per message layer' },
    notes: [
      'Reply rates run roughly three times higher than standard Message Ads.',
      'A Lead Gen Form can sit inside the conversation, so nobody leaves the inbox.',
      'Include a graceful "not interested" button. It beats the formal opt-out.',
      'The opening line does the work of a subject line: name a specific problem.',
    ],
    preview: 'message',
  },
  'Event ad': {
    fields: [{ key: 'intro', label: 'Introductory text', limit: 600, visible: 150, rows: 4 }],
    asset: { ratios: ['4:1, pulled from the LinkedIn Event page'], size: 'Set on the Event page', types: 'Requires a LinkedIn Event to exist first' },
    notes: [
      'Headline and image come from the Event page, so get that right before building the ad.',
      'Can be combined with Conversation Ads so registration happens inside the message.',
    ],
    /* The Event itself is the real dependency, and it is where these stall.
     * Listing what it needs turns "make a LinkedIn Event" into a checklist
     * somebody can actually hand over. */
    prerequisite: {
      title: 'The LinkedIn Event has to exist first',
      body: 'The ad pulls its headline and image from the Event page, so none of the ad copy can be finalised until the Event is live. Setting one up needs all of the following.',
      items: [
        'Event name, which becomes the ad headline and cannot be edited per ad',
        'Date and start time, with the time zone stated',
        'Format: online, or in person with a venue address',
        'Description of what attendees get',
        'Cover image at 4:1, which becomes the ad image',
        'Registration method: LinkedIn registration form, or an external link',
      ],
    },
    preview: 'feed',
  },
  /* A follower ad is a Dynamic Ad. LinkedIn assembles it per viewer from
   * the Company Page and that member's own profile, so there is no image to
   * design, but there are two short copy fields to choose or write. */
  'Follower ad': {
    fields: [
      { key: 'headline', label: 'Headline', limit: 50, visible: 50, rows: 2, note: 'Pick one of LinkedIn\'s suggested headlines or write your own. Internal note: the viewer sees their own first name alongside this.' },
      { key: 'description', label: 'Description', limit: 70, visible: 70, rows: 2, note: 'Suggested options are offered here too.' },
    ],
    generated: {
      title: 'Assembled per viewer from the Page and their profile',
      body: 'A follower ad is personalised: each member sees their own profile photo next to the company logo, with their first name and the company name in the copy. Nobody else sees their details. There is no ad image to produce, so the design work is the Page logo and nothing else.',
      supply: [
        'Company Page logo, at least 100 x 100 JPG or PNG, since the ad uses it directly',
        'Headline, up to 50 characters, chosen from the suggestions or written',
        'Description, up to 70 characters',
        'Company name as it should read, up to 25 characters, shown on hovering the logo',
        'The CTA existing followers see: Visit company, Visit jobs, or Visit life. Non-followers always see Follow',
      ],
      caveats: [
        'Members who have opted out of ad personalisation will not see it.',
        'With no profile photo available the logo centres instead; with no name available it reads "LinkedIn Member".',
      ],
    },
    asset: { ratios: ['Company logo, 100 x 100 minimum'], size: '2 MB', types: 'JPG, PNG', extra: 'Dynamic ad format, desktop only' },
    notes: [
      'Check the Page logo before launch. Whatever is on the Page is what runs.',
      'Non-followers see Follow. Existing followers see the alternative CTA you pick, so set it deliberately.',
      'Exports label this as Ad Set Type "Dynamic".',
    ],
    preview: 'follower',
  },
};

const FORMAT_KEYS = Object.keys(FORMATS);

/* The objective changes what LinkedIn renders around the ad, not just how
 * it is bought. Engagement is the only one of the three that gets a Follow
 * button on the post — briefing a designer without knowing that is how you
 * end up with a layout that has no room for it. */
const OBJECTIVES = ['Brand awareness', 'Engagement', 'Website visits'];
const FOLLOW_OBJECTIVE = 'Engagement';
let uid = 0;
const nextId = () => `c${++uid}`;

const truncate = (t, at) =>
  !t ? { shown: '', cut: false } : t.length <= at ? { shown: t, cut: false } : { shown: t.slice(0, at).trimEnd(), cut: true };

/* Formats whose CTA can point at a Lead Gen Form rather than a landing
 * page. Rail and dynamic formats cannot carry one at all. */
const FORM_CAPABLE = new Set([
  'Single image',
  'Carousel',
  'Video',
  'Document',
  'Message ad',
  'Conversation ad',
]);

/* A Document ad is briefed with its form either way: gating it is the
 * normal case, and the section is what says so when it is not gated. */
const needsForm = (item) =>
  item.format === 'Document' || item.ctaDestination === 'Lead Gen Form';

function fieldsFor(item) {
  return FORMATS[item.format].fields.map((f) =>
    f.dynamic === 'carousel' && item.ctaDestination === 'Lead Gen Form'
      ? { ...f, limit: 30, visible: 30, note: 'Reduced from 45 because the CTA points at a Lead Gen Form' }
      : f
  );
}

function issuesFor(item) {
  const out = [];
  for (const f of fieldsFor(item)) {
    const v = item.copy[f.key] || '';
    if (!v) continue;
    if (v.length > f.limit) {
      out.push({ level: 'blocker', field: f.label, text: `${v.length} characters against a hard limit of ${f.limit}. LinkedIn will reject the upload.` });
    } else if (f.visible < f.limit && v.length > f.visible) {
      out.push({ level: 'action', field: f.label, text: `Runs past the ${f.visible}-character truncation point, so everything after it hides behind "see more".` });
    }
  }
  const head = item.copy.headline || '';
  const letters = head.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) {
    out.push({ level: 'note', field: 'Headline', text: 'Mostly capitals. Reads as shouting and can trip ad review.' });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * PDF generation
 * ------------------------------------------------------------------ */
function buildPdf(jsPDF, brief, items, logo = null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15, RIGHT = W - M, COL = W - M * 2;
  let y = 0;

  const NAVY = [58, 63, 122];
  const GREY = [92, 95, 87];
  const RED = [168, 52, 42];

  const need = (mm) => {
    if (y + mm > 282) { doc.addPage(); y = M; return true; }
    return false;
  };
  const rule = (weight = 0.2, colour = [180, 178, 168]) => {
    doc.setDrawColor(...colour).setLineWidth(weight).line(M, y, RIGHT, y);
  };
  const label = (t, x = M) => {
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...GREY);
    doc.text(t.toUpperCase(), x, y, { charSpace: 0.4 });
  };
  const body = (t, x, maxW, size = 9, style = 'normal', colour = [20, 20, 18]) => {
    doc.setFont('helvetica', style).setFontSize(size).setTextColor(...colour);
    const lines = doc.splitTextToSize(String(t ?? ''), maxW);
    doc.text(lines, x, y);
    return lines.length * (size * 0.42);
  };

  /** A wrapped paragraph that can break across a page. */
  const para = (t, { x = M, w = COL, size = 8, colour = [60, 60, 55], style = 'normal' } = {}) => {
    doc.setFont('helvetica', style).setFontSize(size).setTextColor(...colour);
    for (const line of doc.splitTextToSize(String(t ?? ''), w)) {
      need(6);
      doc.text(line, x, y);
      y += size * 0.44;
    }
  };

  /** Label on the left, value on the right, with an optional count.
   *
   * The wrap width is measured at the size the value is drawn at. Measuring
   * at whatever size was last set produces lines wider than the column, and
   * they run straight through the count on the right. */
  const specLine = (k, v, right = null) => {
    const value = String(v ?? '').trim();
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    const lines = doc.splitTextToSize(value || 'to be written', COL - 42 - 30);
    need(lines.length * 3.6 + 6);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
    doc.text(k, M, y);
    doc.setFontSize(8.5);
    if (value) doc.setTextColor(20, 20, 18);
    else doc.setTextColor(150, 150, 145);
    doc.text(lines, M + 42, y);
    if (right) {
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GREY);
      doc.text(right, RIGHT, y, { align: 'right' });
    }
    y += Math.max(4.5, lines.length * 3.6) + 1.2;
    rule(0.15, [210, 208, 198]);
    y += 2.6;
  };

  const subLabel = (t, right = null) => {
    need(10);
    y += 2;
    label(t);
    if (right) {
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GREY);
      doc.text(right, RIGHT, y, { align: 'right' });
    }
    y += 2.5;
    rule(0.25, [140, 138, 128]);
    y += 4;
  };

  const flagList = (list) => {
    for (const n of list) {
      doc.setFont('helvetica', 'bold').setFontSize(7.5);
      doc.setTextColor(...(n.level === 'blocker' ? RED : GREY));
      const w = doc.getTextWidth(`${n.field}: `);
      const lines = doc.splitTextToSize(n.text, COL - w);
      need(lines.length * 3.4 + 4);
      doc.setFont('helvetica', 'bold').setFontSize(7.5);
      doc.setTextColor(...(n.level === 'blocker' ? RED : GREY));
      doc.text(`${n.field}:`, M, y);
      doc.setFont('helvetica', 'normal').setTextColor(60, 60, 55);
      doc.text(lines, M + w, y);
      y += lines.length * 3.4 + 1.5;
    }
  };

  /**
   * The Lead Gen Form behind a creative.
   *
   * Everything the form needs, including the limits, so the page can be
   * handed to a copywriter on its own. The delivery warning is drawn first
   * and in red because it is the failure that costs the client the leads
   * rather than the campaign a day.
   */
  const drawForm = (item) => {
    const f = item.form || EMPTY_FORM;
    const flags = formIssues(f);
    const count = (v, limit) => `${String(v || '').length} / ${limit}`;

    need(40);
    y += 3;
    rule(0.4, [20, 20, 18]);
    y += 5.5;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...NAVY);
    doc.text('Lead Gen Form', M, y);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
    doc.text(
      item.format === 'Document' ? 'gates the document' : 'the CTA points here',
      RIGHT,
      y,
      { align: 'right' }
    );
    y += 6;

    /* ---- the blocker ---- */
    const warn = doc.splitTextToSize(DELIVERY_WARNING.body, COL - 8);
    need(warn.length * 3.4 + 12);
    const boxH = warn.length * 3.4 + 10;
    doc.setFillColor(249, 237, 233).rect(M, y - 4.5, COL, boxH, 'F');
    doc.setFillColor(...RED).rect(M, y - 4.5, 1.3, boxH, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...RED);
    doc.text(DELIVERY_WARNING.title.toUpperCase(), M + 4, y, { charSpace: 0.3 });
    y += 4.2;
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(90, 55, 40);
    doc.text(warn, M + 4, y);
    y += warn.length * 3.4 + 6;

    /* ---- setup ---- */
    subLabel('Form setup');
    specLine('Form name', f.name, count(f.name, FORM_LIMITS.name));
    specLine('Language', f.language, 'match campaign');
    specLine('Offer headline', f.offerHeadline, count(f.offerHeadline, FORM_LIMITS.offerHeadline));
    specLine(
      'Offer details',
      f.offerDetails,
      `${String(f.offerDetails || '').length} / ${FORM_LIMITS.offerDetailsVisible} · max ${FORM_LIMITS.offerDetails}`
    );

    /* ---- fields ---- */
    subLabel('Fields to collect', `${fieldCount(f)} of ${MAX_FIELDS}`);
    para(
      `Maximum ${MAX_FIELDS} fields, and custom questions count towards that. LinkedIn's own best practice is 3 to 4: every field past the fourth costs completions. First name, last name and email address are selected by default and can be unselected. Work email is a separate field from email address and is the one that matters for B2B.`
    );
    y += 2;
    para(f.fields.length ? f.fields.join(', ') : 'none selected', {
      size: 8.5,
      colour: [20, 20, 18],
    });
    y += 3;

    /* ---- custom questions ---- */
    subLabel('Custom questions', `${f.questions.length} of ${MAX_QUESTIONS}`);
    para(
      `Up to ${MAX_QUESTIONS}, ${FORM_LIMITS.question} characters each, single-line text or multiple choice. They count towards the ${MAX_FIELDS} field maximum.`
    );
    y += 2;
    if (!f.questions.length) {
      para('None.', { colour: [150, 150, 145] });
    } else {
      f.questions.forEach((q, i) =>
        specLine(
          `${i + 1}. ${q.type}`,
          q.text,
          count(q.text, FORM_LIMITS.question)
        )
      );
    }
    y += 2;

    /* ---- consent ---- */
    subLabel('Consent and opt-out', `${f.consents.length} of ${MAX_CONSENTS}`);
    para(
      `Up to ${MAX_CONSENTS} custom checkboxes, ${FORM_LIMITS.consent} characters each, each required or optional. They do not count towards the ${MAX_FIELDS} field maximum. Marketing opt-in and any additional consent goes here.`
    );
    y += 2;
    if (!f.consents.length) {
      para('None.', { colour: [150, 150, 145] });
    } else {
      f.consents.forEach((c, i) =>
        specLine(
          `${i + 1}. ${c.required ? 'Required' : 'Optional'}`,
          c.text,
          count(c.text, FORM_LIMITS.consent)
        )
      );
    }
    y += 2;

    /* ---- privacy ---- */
    subLabel('Data privacy');
    specLine('Privacy policy URL', f.privacyUrl, 'https:// required');
    specLine('Privacy policy text', f.privacyText, count(f.privacyText, FORM_LIMITS.privacyText));
    para(`${PRIVACY_NOTE.title}. ${PRIVACY_NOTE.body}`);
    y += 3;

    /* ---- confirmation ---- */
    subLabel('Confirmation screen');
    specLine('Thank you message', f.thankYou, count(f.thankYou, FORM_LIMITS.thankYou));
    specLine('Landing page URL', f.landingUrl, count(f.landingUrl, FORM_LIMITS.landingUrl));
    specLine('Call to action', f.cta, `dropdown · ${FORM_LIMITS.cta} max`);
    const delivery =
      DELIVERY_OPTIONS.find((d) => d.key === f.delivery) || DELIVERY_OPTIONS[0];
    specLine('Delivery', delivery.key, null);
    para(delivery.detail);
    y += 3;

    /* ---- hidden fields ---- */
    subLabel('Hidden fields', `${f.hidden.length} of ${MAX_HIDDEN}`);
    para(
      `Up to ${MAX_HIDDEN}, for tracking values such as campaign or source. Not shown to members, and they collect no additional personal data.`
    );
    y += 2;
    para(
      f.hidden.length
        ? f.hidden.map((h) => `${h.name || 'unnamed'} = ${h.value || 'to be set'}`).join(', ')
        : 'None.',
      { colour: f.hidden.length ? [20, 20, 18] : [150, 150, 145] }
    );
    y += 3;

    /* ---- the document ---- */
    if (item.format === 'Document') {
      subLabel('The document itself');
      specLine('File types', DOCUMENT_SPEC.types);
      specLine('Max file size', DOCUMENT_SPEC.size);
      specLine('Length', DOCUMENT_SPEC.pages);
      for (const n of DOCUMENT_SPEC.notes) para(`•  ${n}`);
      y += 1;
      para(
        'There is no form banner image. The visual on a Document ad is the document preview itself. A 300x250 banner belongs to Message Ads, not to Lead Gen Forms.'
      );
      y += 3;
    }

    if (flags.length) {
      subLabel('Form flags', `${flags.filter((n) => n.level === 'blocker').length} blocking`);
      flagList(flags);
      y += 2;
    }
  };

  /* ---- header ---- */
  y = 20;
  drawLogo(doc, logo, { x: RIGHT - LOGO_WIDTH_MM, y: y - 6 });
  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...NAVY);
  doc.text('CREATIVE BRIEF · LINKEDIN ADS', M, y, { charSpace: 0.6 });
  y += 7;
  doc.setFont('helvetica', 'bold').setFontSize(19).setTextColor(20, 20, 18);
  const title = [brief.client || 'Client', brief.campaign].filter(Boolean).join(', ');
  doc.text(doc.splitTextToSize(title, COL - 55), M, y);

  const meta = [
    ['Prepared', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })],
    brief.objective ? ['Objective', brief.objective] : null,
    brief.deadline ? ['Assets needed', new Date(brief.deadline + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })] : null,
    ['Creatives', String(items.length)],
    ['Assets to produce', String(items.reduce((n, i) => n + (Number(i.quantity) || 0), 0))],
  ].filter(Boolean);

  /* Label above value, both right-aligned, so a long value cannot run
   * through its own label. */
  let my = y + 8;
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...GREY);
    doc.text(k.toUpperCase(), RIGHT, my, { align: 'right', charSpace: 0.3 });
    my += 3.6;
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(20, 20, 18);
    const lines = doc.splitTextToSize(String(v), 60);
    doc.text(lines, RIGHT, my, { align: 'right' });
    my += lines.length * 3.9 + 2.4;
  }
  y = Math.max(y + 6, my) + 1;
  rule(0.6, [20, 20, 18]);
  y += 7;

  /* ---- direction, split by who it is for ---- */
  if (brief.notes) {
    label('Design direction');
    y += 4;
    doc.setFont('helvetica', 'normal').setFontSize(9);
    y += body(brief.notes, M, COL, 9);
    y += 6;
  }
  /* The objective changes what LinkedIn renders around the ad, so the
   * designer needs it stated rather than inferred. */
  if (brief.objective) {
    label('Objective');
    y += 4;
    doc.setFont('helvetica', 'normal').setFontSize(9);
    y += body(
      brief.objective === FOLLOW_OBJECTIVE
        ? `${brief.objective}. LinkedIn adds a Follow button to the post header on this objective, so leave room top right.`
        : `${brief.objective}. No Follow button on this objective; LinkedIn only adds one for ${FOLLOW_OBJECTIVE}.`,
      M, COL, 9
    );
    y += 6;
  }

  /* ---- summary table ---- */
  label('Summary');
  y += 3.5;
  rule(0.4, [20, 20, 18]);
  y += 4.5;
  const cols = [M, M + 62, M + 82, RIGHT - 24];
  doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...GREY);
  ['Format', 'Variants', 'Dimensions', 'Max size'].forEach((h, i) =>
    doc.text(h.toUpperCase(), cols[i], y, { charSpace: 0.3 })
  );
  y += 3;
  rule(0.3, [140, 138, 128]);
  y += 4;
  for (const it of items) {
    need(8);
    const s = FORMATS[it.format];
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(20, 20, 18);
    doc.text(it.format, cols[0], y);
    doc.text(String(it.quantity), cols[1], y);
    const dim = doc.splitTextToSize(s.asset.ratios[0], 62);
    doc.setFontSize(7.5).setTextColor(...GREY);
    doc.text(dim[0], cols[2], y);
    doc.text(s.asset.size, cols[3], y);
    y += Math.max(5, dim.length * 3.2);
    rule(0.15, [210, 208, 198]);
    y += 3.5;
  }
  y += 5;

  /* ---- per creative ---- */
  items.forEach((item, idx) => {
    const s = FORMATS[item.format];
    const flds = fieldsFor(item);
    const iss = issuesFor(item);
    need(50);

    rule(0.5, [20, 20, 18]);
    y += 6;
    doc.setFillColor(...NAVY);
    doc.rect(M, y - 4, 5.5, 5.5, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(255, 255, 255);
    doc.text(String(idx + 1), M + 2.75, y - 0.2, { align: 'center' });
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 20, 18);
    doc.text(item.format, M + 8, y);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GREY);
    doc.text(`${item.quantity} variant${item.quantity === 1 ? '' : 's'}`, RIGHT, y, { align: 'right' });
    y += 7;

    /* spec + production notes, two columns */
    const colW = (COL - 8) / 2;
    const startY = y;
    label('Asset specification');
    y += 4;
    const specRows = [
      ['Dimensions', s.asset.ratios.join('\n')],
      ['Max file size', s.asset.size],
      ['File types', s.asset.types],
      ...(s.asset.extra ? [['Also', s.asset.extra]] : []),
      ...(FORM_CAPABLE.has(item.format) ? [['CTA destination', item.ctaDestination]] : []),
    ];
    for (const [k, v] of specRows) {
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
      doc.text(k, M, y);
      doc.setFontSize(7.5).setTextColor(20, 20, 18);
      const lines = doc.splitTextToSize(v, colW - 26);
      doc.text(lines, M + 26, y);
      y += Math.max(4, lines.length * 3.2) + 0.8;
    }
    const leftEnd = y;

    y = startY;
    label('Production notes', M + colW + 8);
    y += 4;
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(60, 60, 55);
    for (const n of s.notes) {
      const lines = doc.splitTextToSize(`•  ${n}`, colW);
      doc.text(lines, M + colW + 8, y);
      y += lines.length * 3.3 + 1.2;
    }
    y = Math.max(leftEnd, y) + 4;

    /* copy table */
    need(24);
    label('Copy');
    y += 3.5;
    rule(0.4, [20, 20, 18]);
    y += 4.5;
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...GREY);
    doc.text('FIELD', M, y, { charSpace: 0.3 });
    doc.text('COPY', M + 32, y, { charSpace: 0.3 });
    doc.text('CHARS', RIGHT - 34, y, { align: 'right', charSpace: 0.3 });
    doc.text('VISIBLE', RIGHT - 18, y, { align: 'right', charSpace: 0.3 });
    doc.text('MAX', RIGHT, y, { align: 'right', charSpace: 0.3 });
    y += 3;
    rule(0.3, [140, 138, 128]);
    y += 4;

    for (const f of flds) {
      const v = item.copy[f.key] || '';
      const over = v.length > f.limit;
      doc.setFont('helvetica', 'normal').setFontSize(8.5);
      const lines = doc.splitTextToSize(v || 'to be written', COL - 32 - 40);
      need(lines.length * 3.6 + 6);
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
      doc.text(f.label, M, y);
      doc.setFontSize(8.5).setTextColor(v ? 20 : 150, v ? 20 : 150, v ? 18 : 145);
      doc.text(lines, M + 32, y);
      doc.setFont('helvetica', over ? 'bold' : 'normal').setFontSize(7.5);
      doc.setTextColor(...(over ? RED : GREY));
      doc.text(String(v.length), RIGHT - 34, y, { align: 'right' });
      doc.setFont('helvetica', 'normal').setTextColor(...GREY);
      doc.text(String(f.visible), RIGHT - 18, y, { align: 'right' });
      doc.text(String(f.limit), RIGHT, y, { align: 'right' });
      y += Math.max(5, lines.length * 3.6) + 1.5;
      rule(0.15, [210, 208, 198]);
      y += 3;
    }

    if (item.notes) {
      need(14);
      y += 2;
      label('Copywriting notes');
      y += 4;
      y += body(item.notes, M, COL, 8.5);
      y += 4;
    }

    if (iss.length) {
      need(10 + iss.length * 6);
      y += 1;
      label('Flags');
      y += 4;
      flagList(iss);
      y += 3;
    }

    /* The form is half the brief on a Document ad, so it prints with the
     * creative it belongs to rather than as an appendix. */
    if (needsForm(item)) drawForm(item);

    y += 4;
  });

  /* ---- footer on every page ---- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(180, 178, 168).setLineWidth(0.2).line(M, 288, RIGHT, 288);
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GREY);
    doc.text(
      'Character limits are LinkedIn\'s own. "Visible" is where the feed truncates, so copy past that point hides behind a click. "Max" is where upload is rejected.',
      M, 291.5
    );
    doc.text(`${p} / ${pages}`, RIGHT, 291.5, { align: 'right' });
  }
  return doc;
}

/* ------------------------------------------------------------------ */

/** A new creative. Document ads start gated, which is the normal case. */
function newItem(format) {
  return {
    id: nextId(),
    format,
    copy: {},
    ctaDestination: format === 'Document' ? 'Lead Gen Form' : 'Landing page',
    quantity: 1,
    notes: '',
    form: { ...EMPTY_FORM, fields: [...DEFAULT_FIELDS] },
  };
}

export default function CreativeBrief() {
  const [brief, setBrief] = useState({
    client: '',
    campaign: '',
    objective: OBJECTIVES[0],
    deadline: '',
    notes: '',
  });
  const [items, setItems] = useState([
    newItem('Single image'),
  ]);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => { if (!activeId && items.length) setActiveId(items[0].id); }, [items, activeId]);

  /* Seeded from the intake form: the campaign name is the one typed there,
   * not the objective, and the formats chosen there arrive as creatives so
   * nobody re-enters the same list twice. */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('brief:current');
        if (!r?.value) return;
        const b = JSON.parse(r.value);
        setBrief((p) => ({
          ...p,
          client: b.client || '',
          campaign: b.campaignName || '',
          objective: objectivesOf(b).find((o) => OBJECTIVES.includes(o)) || p.objective,
        }));
        const picks = (b.creatives || []).filter((c) => FORMATS[c.format]);
        if (picks.length) {
          const seeded = picks.map((c) => ({
            ...newItem(c.format),
            quantity: Math.min(20, Math.max(1, Number(c.quantity) || 1)),
          }));
          setItems(seeded);
          setActiveId(seeded[0].id);
        }
      } catch { /* no saved brief */ }
    })();
  }, []);

  const active = items.find((i) => i.id === activeId) || items[0];
  const setItem = (id, patch) => setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const setCopy = (id, key, v) => setItems((p) => p.map((i) => (i.id === id ? { ...i, copy: { ...i.copy, [key]: v } } : i)));
  const bump = (id, delta) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, quantity: Math.min(20, Math.max(1, i.quantity + delta)) } : i)));

  const addItem = (format) => {
    const it = newItem(format);
    setItems((p) => [...p, it]);
    setActiveId(it.id);
  };
  const removeItem = (id) =>
    setItems((p) => {
      const next = p.filter((i) => i.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
  const duplicateItem = (id) => {
    const src = items.find((i) => i.id === id);
    const c = {
      ...src,
      id: nextId(),
      copy: { ...src.copy },
      form: { ...src.form, fields: [...src.form.fields] },
    };
    setItems((p) => [...p, c]);
    setActiveId(c.id);
  };

  /* ---- the Lead Gen Form on the active creative ---- */
  const setForm = (id, patch) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, form: { ...i.form, ...patch } } : i)));
  const toggleFormField = (id, field) =>
    setItems((p) =>
      p.map((i) =>
        i.id === id
          ? {
              ...i,
              form: {
                ...i.form,
                fields: i.form.fields.includes(field)
                  ? i.form.fields.filter((f) => f !== field)
                  : [...i.form.fields, field],
              },
            }
          : i
      )
    );
  const setList = (id, key, list) => setForm(id, { [key]: list });

  const totalAssets = items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  const blockerCount = items.reduce(
    (n, i) =>
      n +
      issuesFor(i).filter((x) => x.level === 'blocker').length +
      (needsForm(i) ? formIssues(i.form).filter((x) => x.level === 'blocker').length : 0),
    0
  );
  const activeFields = active ? fieldsFor(active) : [];
  const activeIssues = active ? issuesFor(active) : [];
  const spec = active ? FORMATS[active.format] : null;
  const formNeeded = active ? needsForm(active) : false;
  const form = active?.form || EMPTY_FORM;
  const formFlags = formNeeded ? formIssues(form) : [];
  const introT = active ? truncate(active.copy.intro, activeFields.find((f) => f.key === 'intro')?.visible ?? 150) : { shown: '', cut: false };
  const headT = active ? truncate(active.copy.headline, activeFields.find((f) => f.key === 'headline')?.visible ?? 70) : { shown: '', cut: false };

  const [exporting, setExporting] = useState(false);

  /* jsPDF is around 130 kB. Loading it on click rather than on page load
   * keeps this page the same weight as every other tool. */
  const exportPdf = async () => {
    setExporting(true);
    const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadLogo()]);
    const doc = buildPdf(jsPDF, brief, items, logo);
    const name = [brief.client || 'Creative brief', brief.campaign, new Date().toISOString().slice(0, 10)]
      .filter(Boolean).join(', ').replace(/[^\w\s,-]/g, '');
    doc.save(`${name}.pdf`);
    setExporting(false);
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="sheet">
        <header className="masthead">
          <div>
            <div className="mast-eyebrow">LinkedIn Ads · Whitehart</div>
            <h1 className="mast-title">Creative brief</h1>
            <div className="linked">
              {brief.objective}
              {' · '}
              {items.length} creative{items.length === 1 ? '' : 's'} · {totalAssets} asset{totalAssets === 1 ? '' : 's'}
              {blockerCount > 0 && ` · ${blockerCount} over limit`}
            </div>
          </div>
          <div className="mast-right">
            <button type="button" className="btn" onClick={exportPdf} disabled={exporting}>
              {exporting ? 'Building…' : 'Download PDF'}
            </button>
          </div>
        </header>

        <div className="cols">
          <div className="panel inputs">
            <section className="grp">
              <h2 className="grp-head"><span className="grp-letter">A</span>Brief</h2>
              <div className="grp-body">
                <label className="row"><span className="row-label">Client</span>
                  <input className="inp" value={brief.client} placeholder="Client name"
                    onChange={(e) => setBrief((p) => ({ ...p, client: e.target.value }))} /></label>
                <label className="row"><span className="row-label">Campaign</span>
                  <input className="inp" value={brief.campaign} placeholder="Campaign name"
                    onChange={(e) => setBrief((p) => ({ ...p, campaign: e.target.value }))} /></label>
                <div className="row obj-row">
                  <span className="row-label">Campaign objective</span>
                  <span className="obj">
                    {OBJECTIVES.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className={brief.objective === o ? 'obj-b on' : 'obj-b'}
                        onClick={() => setBrief((p) => ({ ...p, objective: o }))}
                      >
                        {o}
                      </button>
                    ))}
                  </span>
                </div>
                <label className="row"><span className="row-label">Assets needed by</span>
                  <input className="inp" type="date" value={brief.deadline}
                    onChange={(e) => setBrief((p) => ({ ...p, deadline: e.target.value }))} /></label>
                <label className="stack">
                  <span className="row-label">Design direction</span>
                  <span className="row-hint">
                    For the designer. Brand guidelines, art direction, imagery, colour, anything
                    to avoid visually.
                  </span>
                  <textarea className="ta" rows={3} value={brief.notes}
                    placeholder="Brand guidelines, art direction, imagery to use or avoid…"
                    onChange={(e) => setBrief((p) => ({ ...p, notes: e.target.value }))} /></label>
              </div>
            </section>

            <section className="grp">
              <h2 className="grp-head">
                <span className="grp-letter">B</span>Creatives
                <span className="grp-note">click to edit</span>
              </h2>
              <div className="grp-body">
                <div className="list">
                  {items.map((i) => {
                    const bad = issuesFor(i).filter((x) => x.level === 'blocker').length;
                    return (
                      <div className={`li${i.id === activeId ? ' on' : ''}${bad ? ' bad' : ''}`} key={i.id}>
                        <button type="button" className="li-main" onClick={() => setActiveId(i.id)}>
                          <span className="li-dot">{i.id === activeId ? '●' : '○'}</span>
                          <span className="li-fmt">{i.format}</span>
                          {bad > 0 && <span className="li-bad">{bad} over</span>}
                        </button>
                        <span className="stepper">
                          <button type="button" className="st" onClick={() => bump(i.id, -1)}
                            disabled={i.quantity <= 1} aria-label="One fewer variant">−</button>
                          <span className="st-n">{i.quantity}</span>
                          <button type="button" className="st" onClick={() => bump(i.id, 1)}
                            disabled={i.quantity >= 20} aria-label="One more variant">+</button>
                        </span>
                        <button type="button" className="mini" onClick={() => duplicateItem(i.id)}>Copy</button>
                        <button type="button" className="mini del" onClick={() => removeItem(i.id)}
                          disabled={items.length === 1}>×</button>
                      </div>
                    );
                  })}
                </div>
                <div className="addrow">
                  <span className="row-label">Add</span>
                  <div className="chips">
                    {FORMAT_KEYS.map((f) => (
                      <button key={f} type="button" className="chip" onClick={() => addItem(f)}>+ {f}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {active && (
              <section className="grp">
                <h2 className="grp-head"><span className="grp-letter">C</span>{active.format}</h2>
                <div className="grp-body">
                  {FORM_CAPABLE.has(active.format) && (
                    <div className="cta-toggle">
                      <span className="row-label">CTA destination</span>
                      {['Landing page', 'Lead Gen Form'].map((o) => (
                        <button key={o} type="button" className={active.ctaDestination === o ? 'ct on' : 'ct'}
                          onClick={() => setItem(active.id, { ctaDestination: o })}>{o}</button>
                      ))}
                    </div>
                  )}
                  {spec.generated && (
                    <div className="genblock">
                      <div className="genblock-head">{spec.generated.title}</div>
                      <p className="genblock-body">{spec.generated.body}</p>
                      <div className="genblock-lab">What to supply</div>
                      <ul className="genblock-list">
                        {spec.generated.supply.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                      {spec.generated.caveats && (
                        <>
                          <div className="genblock-lab">Worth knowing</div>
                          <ul className="genblock-list">
                            {spec.generated.caveats.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                  {spec.prerequisite && (
                    <div className="genblock pre">
                      <div className="genblock-head">{spec.prerequisite.title}</div>
                      <p className="genblock-body">{spec.prerequisite.body}</p>
                      <ul className="genblock-list">
                        {spec.prerequisite.items.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                      <div className="genblock-lab">Then the ad copy below sits on top of it</div>
                    </div>
                  )}
                  {activeFields.map((f) => {
                    const v = active.copy[f.key] || '';
                    const over = v.length > f.limit;
                    const past = !over && f.visible < f.limit && v.length > f.visible;
                    return (
                      <div className="fld" key={f.key}>
                        <div className="fld-top">
                          <span className="fld-label">{f.label}</span>
                          <span className={`count${over ? ' over' : past ? ' past' : ''}`}>
                            {v.length}<em>/{f.visible}{f.visible !== f.limit && ` · max ${f.limit}`}</em>
                          </span>
                        </div>
                        <textarea className={`ta${over ? ' over' : ''}`} rows={f.rows} value={v}
                          onChange={(e) => setCopy(active.id, f.key, e.target.value)} />
                        {f.visible < f.limit && (
                          <div className="meter">
                            <div className="meter-fill" style={{ width: `${Math.min(100, (v.length / f.visible) * 100)}%` }} />
                            <div className="meter-mark" />
                          </div>
                        )}
                        {f.note && <p className="fld-note">{f.note}</p>}
                      </div>
                    );
                  })}
                  <label className="stack">
                    <span className="row-label">Copywriting notes for this creative</span>
                    <span className="row-hint">
                      What this particular execution has to say and why. The overall design
                      direction is set once in section A.
                    </span>
                    <textarea className="ta" rows={2} value={active.notes}
                      placeholder="The angle, the proof point, what it has to land…"
                      onChange={(e) => setItem(active.id, { notes: e.target.value })} /></label>
                </div>
              </section>
            )}

            {active && formNeeded && (
              <LeadGenSection
                item={active}
                flags={formFlags}
                setForm={(patch) => setForm(active.id, patch)}
                toggleField={(f) => toggleFormField(active.id, f)}
                setList={(key, list) => setList(active.id, key, list)}
              />
            )}
          </div>

          <div className="panel out">
            {active && (
              <>
                <div className="pv-wrap">
                  <div className="pv-head">
                    As it renders in feed
                    <span className="pv-obj">{brief.objective}</span>
                  </div>
                  {spec.preview === 'feed' && (
                    <div className="post">
                      <div className="post-top">
                        <div className="avatar" />
                        <div>
                          <div className="post-name">{brief.client || 'Client name'}</div>
                          <div className="post-sub">Promoted</div>
                        </div>
                        {/* LinkedIn only adds Follow on Engagement campaigns. */}
                        {brief.objective === FOLLOW_OBJECTIVE && (
                          <button type="button" className="post-follow" disabled>
                            + Follow
                          </button>
                        )}
                      </div>
                      <p className="post-body">
                        {introT.shown || <span className="ph">Introductory text appears here…</span>}
                        {introT.cut && <span className="more">…see more</span>}
                      </p>
                      <div className="post-img">
                        <span>{active.format === 'Video' ? 'Video' : active.format === 'Document' ? 'Document' : 'Image'}</span>
                      </div>
                      {activeFields.some((f) => f.key === 'headline') && (
                        <div className="post-foot">
                          <div className="post-head">
                            {headT.shown || <span className="ph">Headline</span>}{headT.cut && <span className="more">…</span>}
                          </div>
                          <button type="button" className="post-cta" disabled>Learn more</button>
                        </div>
                      )}
                    </div>
                  )}
                  {spec.preview === 'follower' && (
                    <div className="dyn">
                      <div className="dyn-badge">As each viewer sees it</div>
                      <div className="dyn-card">
                        <div className="dyn-imgs">
                          <span className="dyn-logo">{(brief.client || 'C').charAt(0)}</span>
                          <span className="dyn-avatar" title="the viewer's own profile photo" />
                        </div>
                        <div className="dyn-head">
                          {active.copy.headline || (
                            <span className="ph">Alex, follow {brief.client || 'Client name'}</span>
                          )}
                        </div>
                        {active.copy.description && (
                          <div className="dyn-desc">{active.copy.description}</div>
                        )}
                        <button type="button" className="dyn-cta" disabled>
                          Follow
                        </button>
                      </div>
                      <p className="pv-note">
                        The viewer's own photo sits beside the company logo and their first name
                        appears in the copy. Nobody else sees their details. Existing followers get
                        the alternative CTA instead of Follow.
                      </p>
                    </div>
                  )}
                  {spec.preview === 'feed' && (
                    <p className="pv-note">
                      {brief.objective === FOLLOW_OBJECTIVE
                        ? 'Engagement campaigns carry a Follow button beside the page name. Leave room for it, because it sits over the top-right of the post header.'
                        : `No Follow button on ${brief.objective.toLowerCase()} campaigns. LinkedIn only adds it for Engagement.`}
                    </p>
                  )}
                  {spec.preview === 'rail' && (
                    <div className="rail">
                      <div className="rail-thumb" />
                      <div>
                        <div className="rail-head">{active.copy.headline || <span className="ph">Headline</span>}</div>
                        <div className="rail-desc">{active.copy.description || <span className="ph">Description text</span>}</div>
                        {active.copy.cta && <div className="rail-cta">{active.copy.cta}</div>}
                      </div>
                    </div>
                  )}
                  {spec.preview === 'message' && (
                    <div className="msg">
                      {active.copy.subject && <div className="msg-subj">{active.copy.subject}</div>}
                      <div className="msg-from"><div className="avatar sm" /><span>Sender name · Sponsored</span></div>
                      <p className="msg-body">{active.copy.intro || <span className="ph">Message body appears here…</span>}</p>
                      <button type="button" className="msg-cta" disabled>{active.copy.cta || 'CTA'}</button>
                    </div>
                  )}
                </div>

                {activeIssues.length > 0 && (
                  <ul className="issues">
                    {activeIssues.map((n, i) => (
                      <li key={i} className={`issue ${n.level}`}>
                        <span className="issue-tag">{n.field}</span>{n.text}
                      </li>
                    ))}
                  </ul>
                )}

                <section className="specs">
                  <div className="specs-head">Asset specification</div>
                  <table className="tbl"><tbody>
                    <tr><th>Dimensions</th><td>{spec.asset.ratios.map((r) => <div key={r}>{r}</div>)}</td></tr>
                    <tr><th>Max file size</th><td>{spec.asset.size}</td></tr>
                    <tr><th>File types</th><td>{spec.asset.types}</td></tr>
                    {spec.asset.extra && <tr><th>Also</th><td>{spec.asset.extra}</td></tr>}
                  </tbody></table>
                </section>

                <section className="specs">
                  <div className="specs-head">Worth knowing</div>
                  <ul className="notes">{spec.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </section>

                <p className="disclaimer">
                  Specs verified against 2026 sources. The PDF carries every creative, its specs,
                  the copy with character counts, the Lead Gen Form where there is one, and any
                  flags.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Lead Gen Form
 *
 * A Document ad has two things to brief and this is the second. Every
 * figure here is LinkedIn's own, counted live the same way the ad copy
 * fields are, because a form that will not save is found at build time
 * rather than at brief time otherwise.
 * ------------------------------------------------------------------ */

/** One counted field. Same counter behaviour as the ad copy fields. */
function Counted({ label, value, onChange, limit, visible, rows = 1, placeholder, hint }) {
  const n = String(value || '').length;
  const over = n > limit;
  const past = !over && visible && visible < limit && n > visible;
  return (
    <div className="fld">
      <div className="fld-top">
        <span className="fld-label">{label}</span>
        <span className={`count${over ? ' over' : past ? ' past' : ''}`}>
          {n}
          <em>
            /{visible || limit}
            {visible && visible !== limit ? ` · max ${limit}` : ''}
          </em>
        </span>
      </div>
      <textarea
        className={`ta${over ? ' over' : ''}`}
        rows={rows}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="fld-note">{hint}</p>}
    </div>
  );
}

function SubHead({ children, note }) {
  return (
    <div className="subhead">
      {children}
      {note && <span className="subhead-note">{note}</span>}
    </div>
  );
}

function LeadGenSection({ item, flags, setForm, toggleField, setList }) {
  const f = item.form;
  const used = fieldCount(f);
  const delivery = DELIVERY_OPTIONS.find((d) => d.key === f.delivery) || DELIVERY_OPTIONS[0];

  const addQuestion = () =>
    setList('questions', [...f.questions, { text: '', type: QUESTION_TYPES[0] }]);
  const setQuestion = (i, patch) =>
    setList('questions', f.questions.map((q, n) => (n === i ? { ...q, ...patch } : q)));
  const delQuestion = (i) => setList('questions', f.questions.filter((_, n) => n !== i));

  const addConsent = () => setList('consents', [...f.consents, { text: '', required: false }]);
  const setConsent = (i, patch) =>
    setList('consents', f.consents.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  const delConsent = (i) => setList('consents', f.consents.filter((_, n) => n !== i));

  const addHidden = () => setList('hidden', [...f.hidden, { name: '', value: '' }]);
  const setHidden = (i, patch) =>
    setList('hidden', f.hidden.map((h, n) => (n === i ? { ...h, ...patch } : h)));
  const delHidden = (i) => setList('hidden', f.hidden.filter((_, n) => n !== i));

  return (
    <section className="grp">
      <h2 className="grp-head">
        <span className="grp-letter">D</span>Lead Gen Form
        <span className="grp-note">
          {item.format === 'Document' ? 'gates the document' : 'the CTA points here'}
        </span>
      </h2>
      <div className="grp-body">
        {/* The failure nobody expects, stated before anything is written. */}
        <div className="genblock pre">
          <div className="genblock-head">{DELIVERY_WARNING.title}</div>
          <p className="genblock-body">{DELIVERY_WARNING.body}</p>
        </div>

        <SubHead note="internal name, offer copy">Form setup</SubHead>
        <Counted
          label="Form name"
          value={f.name}
          onChange={(v) => setForm({ name: v })}
          limit={FORM_LIMITS.name}
          placeholder="client_asset_audience_geo_period"
          hint="Internal only. Forms are account-level assets reused across campaigns, so this follows the form naming convention."
        />
        <label className="row">
          <span className="row-label">Language</span>
          <input
            className="inp"
            value={f.language}
            placeholder="English"
            onChange={(e) => setForm({ language: e.target.value })}
          />
        </label>
        <Counted
          label="Offer headline"
          value={f.offerHeadline}
          onChange={(v) => setForm({ offerHeadline: v })}
          limit={FORM_LIMITS.offerHeadline}
          rows={2}
          placeholder="What they get, in one line"
          hint="Cannot be blank."
        />
        <Counted
          label="Offer details"
          value={f.offerDetails}
          onChange={(v) => setForm({ offerDetails: v })}
          limit={FORM_LIMITS.offerDetails}
          visible={FORM_LIMITS.offerDetailsVisible}
          rows={3}
          placeholder="Optional supporting line"
          hint={`Optional. Hard limit ${FORM_LIMITS.offerDetails}, but it truncates past roughly ${FORM_LIMITS.offerDetailsVisible}, so write to that.`}
        />

        <SubHead note={`${used} of ${MAX_FIELDS} used`}>Fields to collect</SubHead>
        <p className="row-hint">
          Maximum {MAX_FIELDS}, and custom questions count towards it. LinkedIn's own best
          practice is 3 to 4: every field past the fourth costs completions. First name, last
          name and email address are selected by default and can be unselected.
        </p>
        {FIELD_GROUPS.map((g) => (
          <div className="fgroup" key={g.title}>
            <div className="fgroup-head">{g.title}</div>
            <div className="ticks">
              {g.fields.map((name) => {
                const on = f.fields.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={on ? 'tick on' : 'tick'}
                    onClick={() => toggleField(name)}
                    aria-pressed={on}
                  >
                    <span className="tick-box">{on ? '×' : ''}</span>
                    {name}
                    {name === 'Work email' && <em className="tick-note">B2B</em>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <SubHead note={`${f.questions.length} of ${MAX_QUESTIONS}`}>Custom questions</SubHead>
        <p className="row-hint">
          Up to {MAX_QUESTIONS}, {FORM_LIMITS.question} characters each, single-line text or
          multiple choice. They count towards the {MAX_FIELDS} field maximum.
        </p>
        {f.questions.map((q, i) => (
          <div className="listrow" key={i}>
            <Counted
              label={`Question ${i + 1}`}
              value={q.text}
              onChange={(v) => setQuestion(i, { text: v })}
              limit={FORM_LIMITS.question}
              rows={2}
            />
            <div className="listrow-foot">
              <select
                className="inp sel"
                value={q.type}
                onChange={(e) => setQuestion(i, { type: e.target.value })}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button type="button" className="mini del" onClick={() => delQuestion(i)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {f.questions.length < MAX_QUESTIONS && (
          <button type="button" className="chip" onClick={addQuestion}>
            + Add question
          </button>
        )}

        <SubHead note={`${f.consents.length} of ${MAX_CONSENTS}`}>Consent and opt-out</SubHead>
        <p className="row-hint">
          Up to {MAX_CONSENTS} custom checkboxes, {FORM_LIMITS.consent} characters each, and each
          can be required or optional. They do not count towards the {MAX_FIELDS} field maximum.
          Marketing opt-in and any additional consent goes here.
        </p>
        {f.consents.map((c, i) => (
          <div className="listrow" key={i}>
            <Counted
              label={`Checkbox ${i + 1}`}
              value={c.text}
              onChange={(v) => setConsent(i, { text: v })}
              limit={FORM_LIMITS.consent}
              rows={3}
            />
            <div className="listrow-foot">
              {['Required', 'Optional'].map((o) => (
                <button
                  key={o}
                  type="button"
                  className={(o === 'Required') === Boolean(c.required) ? 'ct on' : 'ct'}
                  onClick={() => setConsent(i, { required: o === 'Required' })}
                >
                  {o}
                </button>
              ))}
              <button type="button" className="mini del" onClick={() => delConsent(i)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {f.consents.length < MAX_CONSENTS && (
          <button type="button" className="chip" onClick={addConsent}>
            + Add checkbox
          </button>
        )}

        <SubHead note="mandatory">Data privacy</SubHead>
        <label className="row">
          <span className="row-label">Privacy policy URL</span>
          <input
            className="inp wide"
            value={f.privacyUrl}
            placeholder="https://example.com/privacy"
            onChange={(e) => setForm({ privacyUrl: e.target.value })}
          />
        </label>
        <Counted
          label="Privacy policy text"
          value={f.privacyText}
          onChange={(v) => setForm({ privacyText: v })}
          limit={FORM_LIMITS.privacyText}
          rows={3}
          placeholder="Optional wording shown with the policy link"
        />
        <div className="genblock">
          <div className="genblock-head">{PRIVACY_NOTE.title}</div>
          <p className="genblock-body">{PRIVACY_NOTE.body}</p>
        </div>

        <SubHead note="what they see after submitting">Confirmation screen</SubHead>
        <Counted
          label="Thank you message"
          value={f.thankYou}
          onChange={(v) => setForm({ thankYou: v })}
          limit={FORM_LIMITS.thankYou}
          rows={3}
          hint="Cannot be blank."
        />
        <label className="row">
          <span className="row-label">Landing page URL</span>
          <input
            className="inp wide"
            value={f.landingUrl}
            placeholder="https://example.com/report.pdf"
            onChange={(e) => setForm({ landingUrl: e.target.value })}
          />
        </label>
        <label className="row">
          <span className="row-label">Call to action</span>
          <select
            className="inp sel"
            value={f.cta}
            onChange={(e) => setForm({ cta: e.target.value })}
          >
            {CTA_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <p className="row-hint">
          The call to action is a dropdown, {FORM_LIMITS.cta} characters, and it links to the
          landing page URL. That URL is capped at {FORM_LIMITS.landingUrl.toLocaleString('en-GB')}{' '}
          characters and cannot be blank.
        </p>

        <SubHead>Download now, or move to a landing page</SubHead>
        <div className="cta-toggle">
          {DELIVERY_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={f.delivery === o.key ? 'ct on' : 'ct'}
              onClick={() => setForm({ delivery: o.key })}
            >
              {o.key}
            </button>
          ))}
        </div>
        <p className="row-hint">{delivery.detail}</p>

        <SubHead note={`${f.hidden.length} of ${MAX_HIDDEN}`}>Hidden fields</SubHead>
        <p className="row-hint">
          Up to {MAX_HIDDEN}, for tracking values such as campaign or source. They are not shown
          to members and collect no additional personal data.
        </p>
        {f.hidden.map((h, i) => (
          <div className="hidrow" key={i}>
            <input
              className="inp"
              value={h.name}
              placeholder="name"
              onChange={(e) => setHidden(i, { name: e.target.value })}
            />
            <input
              className="inp"
              value={h.value}
              placeholder="value"
              onChange={(e) => setHidden(i, { value: e.target.value })}
            />
            <button type="button" className="mini del" onClick={() => delHidden(i)}>
              ×
            </button>
          </div>
        ))}
        {f.hidden.length < MAX_HIDDEN && (
          <button type="button" className="chip" onClick={addHidden}>
            + Add hidden field
          </button>
        )}

        {item.format === 'Document' && (
          <>
            <SubHead note="what the designer produces">The document itself</SubHead>
            <table className="tbl">
              <tbody>
                <tr>
                  <th>File types</th>
                  <td>{DOCUMENT_SPEC.types}</td>
                </tr>
                <tr>
                  <th>Max file size</th>
                  <td>{DOCUMENT_SPEC.size}</td>
                </tr>
                <tr>
                  <th>Length</th>
                  <td>{DOCUMENT_SPEC.pages}</td>
                </tr>
              </tbody>
            </table>
            <ul className="notes">
              {DOCUMENT_SPEC.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="row-hint">
              There is no form banner image. The visual on a Document ad is the document preview
              itself. A 300x250 banner belongs to Message Ads, not to Lead Gen Forms.
            </p>
          </>
        )}

        {flags.length > 0 && (
          <>
            <SubHead note={`${flags.filter((x) => x.level === 'blocker').length} blocking`}>
              Form flags
            </SubHead>
            <ul className="issues flat">
              {flags.map((n, i) => (
                <li key={i} className={`issue ${n.level}`}>
                  <span className="issue-tag">{n.field}</span>
                  {n.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

const CSS = `
/* Width has to match .cols below, or the header runs past the body. */
.masthead{max-width:1180px;margin:0 auto;display:flex;align-items:flex-end;
  justify-content:space-between;gap:8px;flex-wrap:wrap;}
.mast-right{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;}
.mast-meta{margin:0 0 0 8px;text-align:right;}
.btn{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10.5px;
  letter-spacing:.13em;text-transform:uppercase;padding:9px 16px;cursor:pointer;
  background:var(--carbon);color:var(--white);border:1px solid var(--carbon);}
.btn:disabled{opacity:.45;cursor:default;}
.cols{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1fr .9fr;align-items:start;}
.stack{display:block;padding-top:12px;}
.row-hint{display:block;font-size:10.5px;line-height:1.45;color:var(--ink-2);
  margin:2px 0 5px;text-transform:none;letter-spacing:0;font-weight:400;}
.row-label{font-family:'Archivo Narrow',sans-serif;font-weight:600;font-size:11px;
  letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2);}
.inp{font-family:'Courier Prime',monospace;font-size:13px;color:var(--carbon);
  background:transparent;border:none;border-bottom:1px solid var(--rule);
  padding:2px 0 3px;border-radius:0;outline:none;width:170px;text-align:right;}
.list{display:flex;flex-direction:column;}
.li{display:flex;align-items:center;gap:6px;border-bottom:1px dotted var(--rule);}
.li:last-child{border-bottom:none;}
.li.on{background:#F5F4FA;margin:0 -8px;padding:0 8px;}
.li.bad{background:#FBF0EC;}
.li-main{flex:1;display:flex;align-items:baseline;gap:9px;text-align:left;background:none;
  border:none;padding:8px 0;cursor:pointer;min-width:0;}
.li-dot{color:var(--carbon);font-size:9px;flex:none;}
.li-fmt{font-size:13px;font-weight:500;flex:1;min-width:0;}
.li.on .li-fmt{color:var(--carbon);font-weight:600;}
.li-bad{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--stamp);
  border:1px solid var(--stamp);padding:1px 5px;}
.stepper{display:inline-flex;align-items:center;border:1px solid var(--rule);flex:none;}
.st{width:22px;height:22px;background:none;border:none;cursor:pointer;
  font-family:'Courier Prime',monospace;font-size:15px;line-height:1;color:var(--carbon);padding:0;}
.st:hover:not(:disabled){background:#EDECF6;}
.st:disabled{opacity:.3;cursor:default;}
.st:focus-visible{outline:2px solid var(--carbon);outline-offset:-2px;}
.st-n{min-width:22px;text-align:center;font-family:'Courier Prime',monospace;
  font-size:12.5px;font-weight:700;color:var(--ink);
  border-left:1px solid var(--rule);border-right:1px solid var(--rule);padding:2px 0;}
.mini{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.12em;text-transform:uppercase;background:none;border:1px solid var(--rule);
  color:var(--ink-2);padding:4px 7px;cursor:pointer;white-space:nowrap;}
.mini.del{font-size:12px;padding:2px 7px;line-height:1;}
.mini:disabled{opacity:.35;cursor:default;}
.addrow{margin-top:12px;padding-top:11px;border-top:1px solid var(--rule);}
.chip{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.09em;text-transform:uppercase;padding:5px 8px;background:none;
  border:1px dashed var(--rule);color:var(--ink-2);cursor:pointer;}
.chip:hover{background:#F1F0EA;color:var(--ink);border-style:solid;}
.cta-toggle{display:flex;align-items:center;gap:5px;padding-bottom:11px;margin-bottom:11px;
  border-bottom:1px solid var(--rule);flex-wrap:wrap;}
.ct{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.1em;text-transform:uppercase;padding:5px 9px;background:none;
  border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;}
.ct.on{background:var(--stamp);color:#fff;border-color:var(--stamp);}
.ct:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.genblock{border-left:3px solid var(--carbon);background:#F5F4FA;padding:11px 13px;
  margin-bottom:14px;}
.genblock.pre{border-left-color:var(--stamp);background:#FBF6EC;}
.genblock-head{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--carbon);margin-bottom:5px;}
.genblock.pre .genblock-head{color:var(--stamp);}
.genblock-body{margin:0 0 8px;font-size:12.5px;line-height:1.55;color:#4E4A33;}
.genblock-lab{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);margin:8px 0 4px;}
.genblock-list{margin:0;padding-left:16px;}
.genblock-list li{font-size:12.5px;line-height:1.55;color:#4E4A33;margin-bottom:4px;}
.dyn{max-width:320px;}
.dyn-badge{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:8.5px;
  letter-spacing:.16em;text-transform:uppercase;color:#93803C;margin-bottom:6px;}
.dyn-card{background:#fff;border:1px solid #E0DCC8;padding:16px 14px 14px;text-align:center;}
.dyn-imgs{display:flex;align-items:center;justify-content:center;gap:-6px;margin-bottom:10px;}
.dyn-logo{width:46px;height:46px;background:#E4E7F0;border:1px solid #D2D6E4;display:grid;
  place-items:center;font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:19px;
  color:#6B72A0;position:relative;z-index:2;}
.dyn-avatar{width:46px;height:46px;border-radius:50%;background:#DCE0EC;
  border:2px solid #fff;margin-left:-10px;position:relative;z-index:1;}
.dyn-head{font-size:13px;font-weight:600;line-height:1.35;word-break:break-word;}
.dyn-desc{font-size:11.5px;color:#5C5F57;line-height:1.45;margin-top:4px;word-break:break-word;}
.dyn-cta{margin-top:11px;font-size:12px;font-weight:600;color:#fff;background:#0A66C2;
  border:none;border-radius:15px;padding:6px 20px;}
/* ---- lead gen form ---- */
.subhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  flex-wrap:wrap;margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--rule);
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11px;
  letter-spacing:.13em;text-transform:uppercase;color:var(--carbon);}
.subhead-note{font-family:'Courier Prime',monospace;font-size:10.5px;letter-spacing:0;
  text-transform:none;font-weight:400;color:var(--ink-2);}
.fgroup{margin-bottom:10px;}
.fgroup-head{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);margin-bottom:4px;}
.ticks{display:flex;flex-wrap:wrap;gap:4px 14px;}
.tick{display:inline-flex;align-items:center;gap:6px;font-family:'Archivo',sans-serif;
  font-size:12px;color:var(--ink-2);background:none;border:none;padding:2px 0;cursor:pointer;}
.tick-box{width:14px;height:14px;flex:none;border:1px solid var(--rule);background:var(--white);
  font-family:'Courier Prime',monospace;font-size:13px;line-height:12px;color:var(--carbon);
  text-align:center;}
.tick.on{color:var(--ink);}
.tick.on .tick-box{border-color:var(--carbon);}
.tick:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.tick-note{font-style:normal;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--stamp);
  border:1px solid var(--stamp);padding:0 4px;}
.listrow{border-left:2px solid var(--rule);padding-left:10px;margin-bottom:10px;}
.listrow-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:-6px;}
.hidrow{display:flex;gap:6px;align-items:center;margin-bottom:6px;}
.hidrow .inp{flex:1;text-align:left;width:auto;}
.inp.wide{width:100%;text-align:left;}
.sel{cursor:pointer;text-align:left;width:auto;font-size:12.5px;}
.issues.flat{margin-top:2px;}
.fld{margin-bottom:14px;}
.fld-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px;}
.fld-label{font-family:'Archivo Narrow',sans-serif;font-weight:600;font-size:11px;
  letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2);}
.count{font-family:'Courier Prime',monospace;font-size:12px;color:var(--ok);}
.count em{font-style:normal;color:var(--ink-2);font-size:10.5px;}
.count.past{color:#B07A1E;}
.count.over{color:var(--stamp);font-weight:700;}
.ta{width:100%;font-family:'Courier Prime',monospace;font-size:13px;line-height:1.5;
  color:var(--carbon);background:#FBFAF6;border:1px solid var(--rule);padding:7px 9px;
  border-radius:0;outline:none;resize:vertical;}
.ta:focus{border-color:var(--carbon);background:#F6F5FB;}
.ta.over{border-color:var(--stamp);background:#FCF2F0;}
.meter{position:relative;height:3px;background:#E6E4DA;margin-top:4px;}
.meter-fill{height:100%;background:var(--carbon);transition:width .12s linear;}
.meter-mark{position:absolute;top:-2px;right:0;width:1px;height:7px;background:var(--stamp);}
.fld-note{margin:5px 0 0;font-size:10.5px;line-height:1.45;color:var(--carbon);opacity:.85;}
.obj-row{align-items:flex-start;}
.obj{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;}
.obj-b{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:9px;
  letter-spacing:.1em;text-transform:uppercase;padding:5px 9px;background:none;
  border:1px solid var(--rule);color:var(--ink-2);cursor:pointer;white-space:nowrap;}
.obj-b:hover{background:#F1F0EA;color:var(--ink);}
.obj-b.on{background:var(--carbon);color:var(--white);border-color:var(--carbon);}
.obj-b:focus-visible{outline:2px solid var(--carbon);outline-offset:2px;}
.pv-wrap{padding:14px 16px 16px;border-bottom:1px solid var(--rule-2);}
.pv-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.16em;text-transform:uppercase;color:#93803C;margin-bottom:9px;}
.pv-obj{letter-spacing:0;text-transform:none;font-weight:400;
  font-family:'Courier Prime',monospace;font-size:10.5px;}
.pv-note{margin:8px 0 0;font-size:10.5px;line-height:1.5;color:#93803C;max-width:420px;}
.post{background:#fff;border:1px solid #E0DCC8;max-width:420px;}
.post-top{display:flex;align-items:center;gap:8px;padding:10px 12px 7px;}
.post-follow{margin-left:auto;align-self:flex-start;flex:none;font-size:11.5px;font-weight:600;
  color:#3A3F7A;background:none;border:none;padding:2px 4px;}
.avatar{width:34px;height:34px;background:#DCE0EC;border-radius:50%;flex:none;}
.avatar.sm{width:24px;height:24px;}
.post-name{font-size:12.5px;font-weight:600;}
.post-sub{font-size:10.5px;color:#7A7A72;}
.post-body{margin:0;padding:0 12px 9px;font-size:12.5px;line-height:1.5;
  white-space:pre-wrap;word-break:break-word;}
.more{color:#7A7A72;margin-left:3px;}
.ph{color:#B6B4A9;}
.post-img{aspect-ratio:1/1;background:linear-gradient(135deg,#E4E7F0,#D6DAE8);
  display:grid;place-items:center;font-family:'Archivo Narrow',sans-serif;font-weight:700;
  font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#9AA0B8;}
.post-foot{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#F4F3EF;}
.post-head{font-size:12.5px;font-weight:600;line-height:1.35;flex:1;word-break:break-word;}
.post-cta{font-size:11.5px;font-weight:600;color:#3A3F7A;background:none;
  border:1px solid #3A3F7A;border-radius:14px;padding:5px 13px;flex:none;}
.rail{display:flex;gap:9px;background:#fff;border:1px solid #E0DCC8;padding:11px;max-width:300px;}
.rail-thumb{width:48px;height:48px;background:#DCE0EC;flex:none;}
.rail-head{font-size:12.5px;font-weight:600;line-height:1.3;word-break:break-word;}
.rail-desc{font-size:11.5px;color:#5C5F57;line-height:1.4;margin-top:2px;word-break:break-word;}
.rail-cta{margin-top:6px;display:inline-block;font-size:11px;font-weight:600;color:#3A3F7A;
  border:1px solid #3A3F7A;border-radius:12px;padding:3px 10px;}
.msg{background:#fff;border:1px solid #E0DCC8;padding:12px;max-width:420px;}
.msg-subj{font-size:13px;font-weight:600;margin-bottom:7px;word-break:break-word;}
.msg-from{display:flex;align-items:center;gap:7px;font-size:11px;color:#7A7A72;
  padding-bottom:9px;border-bottom:1px solid #EFEDE4;}
.msg-body{margin:9px 0;font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;}
.msg-cta{font-size:11.5px;font-weight:600;color:#fff;background:#3A3F7A;border:none;
  border-radius:14px;padding:6px 15px;}
.specs{padding:13px 16px 14px;border-bottom:1px solid var(--rule-2);}
.specs-head{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:10px;
  letter-spacing:.16em;text-transform:uppercase;color:#93803C;margin-bottom:8px;}
.tbl th{text-align:left;vertical-align:top;font-family:'Archivo',sans-serif;font-weight:500;
  font-size:12px;color:var(--ink-2);padding:5px 10px 5px 0;white-space:nowrap;
  border-bottom:1px dotted var(--rule-2);}
.tbl td{font-family:'Courier Prime',monospace;font-size:12px;color:var(--ink);
  padding:5px 0;border-bottom:1px dotted var(--rule-2);line-height:1.55;}
.notes{margin:0;padding-left:16px;}
.notes li{font-size:12.5px;line-height:1.55;color:#4E4A33;margin-bottom:6px;}
@media (max-width:900px){
  .sheet{padding:10px;}
  .cols{grid-template-columns:1fr;}
  .inputs{border-right:1px solid var(--ink);}
  .out{position:static;max-height:none;border-top:none;}
}
`;
