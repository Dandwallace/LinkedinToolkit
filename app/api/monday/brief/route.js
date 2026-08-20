import { NextResponse } from 'next/server';
import {
  BRIEF_FILE_COLUMN,
  attachFile,
  boardSchema,
  briefToFields,
  createBriefItem,
  fileColumn,
  isConfigured,
  mondayConfig,
} from '@/lib/monday';

export const dynamic = 'force-dynamic';

/** Whether the form should offer the Monday button at all. */
export async function GET() {
  const cfg = mondayConfig();
  return NextResponse.json({
    configured: isConfigured(),
    /* Never the token itself, only whether one is present. */
    hasToken: Boolean(cfg.token),
    hasBoard: Boolean(cfg.boardId),
  });
}

/**
 * Reads the brief, and the PDF if one came with it.
 *
 * The form sends multipart so the PDF can ride along. JSON is still
 * accepted, without an attachment, because it makes the endpoint testable
 * with curl and costs almost nothing to keep.
 */
async function readPayload(request) {
  const type = request.headers.get('content-type') || '';

  if (type.includes('multipart/form-data')) {
    const form = await request.formData();
    const raw = form.get('brief');
    if (typeof raw !== 'string') throw new Error('The brief part is missing.');
    const pdf = form.get('pdf');
    return {
      brief: JSON.parse(raw),
      pdf: pdf && typeof pdf !== 'string' ? pdf : null,
      pdfName: pdf && typeof pdf !== 'string' ? pdf.name || 'brief.pdf' : 'brief.pdf',
    };
  }

  const body = await request.json();
  return { brief: body?.brief, pdf: null, pdfName: 'brief.pdf' };
}

/**
 * Writes one discovery brief to the Monday board as a new item, then
 * attaches the PDF to it.
 *
 * The item is the thing that matters. Everything after it succeeds is
 * reported rather than thrown: a failed attachment, a column the board does
 * not have, a label that has been renamed. Turning any of those into a
 * failure would lose a brief that is already sitting on the board, and send
 * the user back to fill the form in again for nothing.
 */
export async function POST(request) {
  let payload;
  try {
    payload = await readPayload(request);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Could not read the request: ${err.message}` },
      { status: 400 }
    );
  }

  const brief = payload.brief;
  if (!brief || typeof brief !== 'object') {
    return NextResponse.json({ ok: false, error: 'No brief in the request body.' }, { status: 400 });
  }

  const client = String(brief.client || '').trim();
  const campaignName = String(brief.campaignName || '').trim();

  if (!client) {
    return NextResponse.json(
      { ok: false, error: 'Choose a client first: it decides which group on the board the item lands in.' },
      { status: 400 }
    );
  }
  if (!campaignName) {
    return NextResponse.json(
      { ok: false, error: 'Give the campaign a name first: it becomes the item name on the board.' },
      { status: 400 }
    );
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Monday is not configured on this deployment. Set MONDAY_API_TOKEN and MONDAY_BOARD_ID, then redeploy.',
      },
      { status: 501 }
    );
  }

  /* The item name is the campaign, on its own. The client is carried by the
   * group the item sits in, so repeating it here would only make every row
   * on the board start with the same word. */
  let record;
  try {
    record = await createBriefItem({
      itemName: campaignName,
      groupTitle: client,
      fields: briefToFields(brief),
    });
  } catch (err) {
    /* Monday's own message names the column or permission it objected to,
     * so it goes back to the browser unchanged. It carries no credentials. */
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }

  const warnings = [];
  let attached = false;

  if (payload.pdf) {
    try {
      const schema = await boardSchema();
      const col = fileColumn(schema, BRIEF_FILE_COLUMN);
      if (!col) {
        warnings.push(
          `The board has no file column called "${BRIEF_FILE_COLUMN}", so the PDF was not attached. The item itself saved fine.`
        );
      } else {
        await attachFile({
          itemId: record.id,
          columnId: col.id,
          file: payload.pdf,
          filename: pdfFilename(brief),
        });
        attached = true;
      }
    } catch (err) {
      warnings.push(`The item saved, but the PDF did not attach: ${err.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    id: record.id,
    url: record.url,
    name: record.name,
    group: record.group,
    written: record.written,
    attached,
    /* Fields the board could not take, each with the reason. These are not
     * failures; they are the list of columns somebody would need to add in
     * Monday for the next brief to carry more. */
    unmapped: record.unmapped,
    notes: record.notes,
    warnings,
  });
}

function pdfFilename(brief) {
  const parts = [brief.client, brief.campaignName, new Date().toISOString().slice(0, 10)]
    .filter(Boolean)
    .join(' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
  return `${parts || 'Discovery brief'}.pdf`;
}
