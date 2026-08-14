/**
 * Lead Gen Form specification.
 *
 * A Document ad gated behind a Lead Gen Form is two things to brief, not
 * one: the ad, and the form it opens. The form has its own fields, its own
 * character limits and its own failure modes, and none of them appear
 * anywhere in Campaign Manager's ad copy screens. A copywriter handed only
 * the ad copy cannot finish the job.
 *
 * Figures below are LinkedIn's published limits. They live here rather than
 * in the component so the on-screen counters and the exported PDF cannot
 * drift apart.
 *
 * There is no form banner image. Message Ads take a 300x250 banner; Lead
 * Gen Forms do not have one at all, and the visual on a Document ad is the
 * document preview itself.
 */

export const FORM_LIMITS = {
  name: 256,
  offerHeadline: 60,
  /* Hard limit 160, but it truncates around 70, so 70 is the number that
   * matters when writing it. */
  offerDetails: 160,
  offerDetailsVisible: 70,
  question: 100,
  consent: 500,
  privacyText: 2000,
  thankYou: 300,
  landingUrl: 2000,
  cta: 20,
};

export const MAX_FIELDS = 12;
/** LinkedIn's own best practice. Every field past the fourth costs completions. */
export const BEST_PRACTICE_FIELDS = 4;
export const MAX_QUESTIONS = 3;
export const MAX_CONSENTS = 5;
export const MAX_HIDDEN = 20;

/** Selected by default in Campaign Manager, and unselectable. */
export const DEFAULT_FIELDS = ['First name', 'Last name', 'Email address'];

/**
 * Everything the form can collect from the profile.
 *
 * Work email is listed separately from Email address deliberately. It is
 * the one that matters for B2B and it sits far enough from the personal
 * address in the picker to be missed.
 */
export const FIELD_GROUPS = [
  {
    title: 'Contact',
    fields: [
      'First name',
      'Last name',
      'Email address',
      'LinkedIn Profile URL',
      'Phone number',
      'City',
      'State/Province',
      'Country/Region',
      'Postal code',
      'Work email',
      'Work phone number',
    ],
  },
  {
    title: 'Work',
    fields: ['Job title', 'Function', 'Seniority', 'Company name', 'Company size', 'Industry'],
  },
  {
    title: 'Education',
    fields: ['Degree', 'Field of study', 'University/School', 'Start date', 'Graduation date'],
  },
  { title: 'Demographic', fields: ['Gender'] },
];

export const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);

export const QUESTION_TYPES = ['Single-line text', 'Multiple choice'];

/** The CTA dropdown on the confirmation screen. Every value is inside 20 characters. */
export const CTA_OPTIONS = [
  'Download',
  'View now',
  'Learn more',
  'Visit website',
  'Register',
  'Sign up',
  'Subscribe',
  'Request demo',
  'Get quote',
  'Contact us',
  'Apply now',
  'Try now',
];

/**
 * What happens after the form is submitted.
 *
 * This changes what the copywriter writes, so it is a stated choice rather
 * than something inferred from the landing page URL.
 */
export const DELIVERY_OPTIONS = [
  {
    key: 'Direct download',
    detail:
      'The landing page URL is an ungated link straight to the file. The member clicks the confirmation CTA and the asset opens. Nothing else to build.',
  },
  {
    key: 'Landing page',
    detail:
      'The landing page URL sends them to a page hosting the asset plus a next step. Needs the page to exist, and the asset on it must not be gated a second time.',
  },
];

/** The document itself, for the brief handed to whoever produces it. */
export const DOCUMENT_SPEC = {
  types: 'PDF, DOC, DOCX, PPT or PPTX',
  size: 'Up to 100 MB',
  pages: 'Up to 300 pages',
  notes: [
    'Portrait uses the most feed space, so it is the default unless there is a reason otherwise.',
    'Front-load the value. Page one is the only page guaranteed to be seen, gated or not.',
    'Gated, the first pages show as a preview and the rest sits behind the form. Put the argument in the preview and the payoff behind it.',
    'Read depth is reported per member, so the document can be segmented on afterwards.',
  ],
};

/**
 * The failure nobody expects, and the reason this section exists.
 *
 * LinkedIn does not send the asset to anyone who submits the form. If the
 * offer is a whitepaper and the landing page URL is not the file, the lead
 * never receives what they signed up for, and nothing in Campaign Manager
 * reports that as a problem.
 */
export const DELIVERY_WARNING = {
  title: 'LinkedIn does not send the asset',
  body:
    'Submitting the form does not deliver anything. LinkedIn collects the lead and shows the confirmation screen, and that is all it does. The landing page URL is the only route the member has to the thing they just gave their details for, so it has to be an ungated direct link to the asset, or a page that hosts it with nothing else in the way. Get this wrong and every lead is a person who asked for a document and never got one.',
};

/** LinkedIn tightened privacy policy enforcement in 2026. Pharma clients, so it lands here. */
export const PRIVACY_NOTE = {
  title: 'Privacy policy enforcement, 2026',
  body:
    'LinkedIn increased enforcement of privacy policy requirements in 2026, through both automated and manual review. The policy the URL points at needs to state the data controller, the categories of data collected, the purpose of processing and the legal basis. These are pharma accounts, so a generic corporate privacy page is the likely rejection.',
};

export const EMPTY_FORM = {
  name: '',
  language: '',
  offerHeadline: '',
  offerDetails: '',
  fields: [...DEFAULT_FIELDS],
  questions: [],
  consents: [],
  privacyUrl: '',
  privacyText: '',
  thankYou: '',
  landingUrl: '',
  cta: 'Download',
  hidden: [],
  delivery: 'Direct download',
};

/** Fields plus custom questions, which share the same ceiling of 12. */
export const fieldCount = (form) =>
  (form.fields?.length || 0) + (form.questions?.length || 0);

const len = (v) => String(v || '').length;

/**
 * Everything wrong with a form, worst first.
 *
 * Blockers are things LinkedIn will reject or that break the offer;
 * actions cost completions; notes are worth knowing.
 */
export function formIssues(form = {}) {
  const out = [];
  const add = (level, field, text) => out.push({ level, field, text });

  if (!form.offerHeadline) {
    add('blocker', 'Offer headline', 'Cannot be blank. The form will not save without it.');
  } else if (len(form.offerHeadline) > FORM_LIMITS.offerHeadline) {
    add(
      'blocker',
      'Offer headline',
      `${len(form.offerHeadline)} characters against a limit of ${FORM_LIMITS.offerHeadline}.`
    );
  }

  if (len(form.offerDetails) > FORM_LIMITS.offerDetails) {
    add(
      'blocker',
      'Offer details',
      `${len(form.offerDetails)} characters against a limit of ${FORM_LIMITS.offerDetails}.`
    );
  } else if (len(form.offerDetails) > FORM_LIMITS.offerDetailsVisible) {
    add(
      'action',
      'Offer details',
      `Past roughly ${FORM_LIMITS.offerDetailsVisible} characters it truncates, so the rest is not read.`
    );
  }

  if (len(form.name) > FORM_LIMITS.name) {
    add('blocker', 'Form name', `Over the ${FORM_LIMITS.name} character limit.`);
  } else if (!form.name) {
    add(
      'action',
      'Form name',
      'Internal only, but forms are account-level assets reused across campaigns. Unnamed, the leads list becomes unreadable. Use the form naming convention.'
    );
  }

  if (!form.language) {
    add('action', 'Language', 'Must match the campaign language.');
  }

  const total = fieldCount(form);
  if (total > MAX_FIELDS) {
    add(
      'blocker',
      'Fields',
      `${total} fields including custom questions, against a maximum of ${MAX_FIELDS}. Custom questions count towards the ${MAX_FIELDS}.`
    );
  } else if (total > BEST_PRACTICE_FIELDS) {
    add(
      'action',
      'Fields',
      `${total} fields. LinkedIn's own best practice is 3 to 4, and every field past the fourth costs completions.`
    );
  }

  if ((form.questions?.length || 0) > MAX_QUESTIONS) {
    add('blocker', 'Custom questions', `Maximum ${MAX_QUESTIONS}.`);
  }
  (form.questions || []).forEach((q, i) => {
    if (len(q.text) > FORM_LIMITS.question) {
      add('blocker', `Question ${i + 1}`, `Over the ${FORM_LIMITS.question} character limit.`);
    }
  });

  if ((form.consents?.length || 0) > MAX_CONSENTS) {
    add('blocker', 'Consent checkboxes', `Maximum ${MAX_CONSENTS}.`);
  }
  (form.consents || []).forEach((c, i) => {
    if (len(c.text) > FORM_LIMITS.consent) {
      add('blocker', `Checkbox ${i + 1}`, `Over the ${FORM_LIMITS.consent} character limit.`);
    }
  });

  if (!form.privacyUrl) {
    add('blocker', 'Privacy policy URL', 'Mandatory. The form cannot be published without one.');
  } else if (!/^https?:\/\//i.test(form.privacyUrl)) {
    add('blocker', 'Privacy policy URL', 'Must start with http:// or https://.');
  }
  if (len(form.privacyText) > FORM_LIMITS.privacyText) {
    add('blocker', 'Privacy policy text', `Over the ${FORM_LIMITS.privacyText} character limit.`);
  }

  if (!form.thankYou) {
    add('blocker', 'Thank you message', 'Cannot be blank.');
  } else if (len(form.thankYou) > FORM_LIMITS.thankYou) {
    add('blocker', 'Thank you message', `Over the ${FORM_LIMITS.thankYou} character limit.`);
  }

  if (!form.landingUrl) {
    add(
      'blocker',
      'Landing page URL',
      'Cannot be blank, and it is the only way the member reaches the asset. LinkedIn sends them nothing.'
    );
  } else if (len(form.landingUrl) > FORM_LIMITS.landingUrl) {
    add('blocker', 'Landing page URL', `Over the ${FORM_LIMITS.landingUrl} character limit.`);
  } else if (form.delivery === 'Direct download') {
    add(
      'note',
      'Landing page URL',
      'Set to direct download, so this URL has to be the file itself, ungated. A page that asks for details again is the same lead filling the same form twice.'
    );
  }

  if (len(form.cta) > FORM_LIMITS.cta) {
    add('blocker', 'Call to action', `Over the ${FORM_LIMITS.cta} character limit.`);
  }

  if ((form.hidden?.length || 0) > MAX_HIDDEN) {
    add('blocker', 'Hidden fields', `Maximum ${MAX_HIDDEN}.`);
  }

  if (!(form.fields || []).includes('Work email')) {
    add(
      'note',
      'Work email',
      'Not collected. Work email is a separate field from Email address and it is the one that matters for B2B, because the profile address is often personal.'
    );
  }

  const order = { blocker: 0, action: 1, note: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
