/**
 * The Whitehart mark, for the PDF headers.
 *
 * jsPDF needs image bytes, not a URL, so the file is fetched and turned
 * into a data URL the first time a PDF is built and cached after that.
 * Both briefs draw it the same way, which is the point of it living here.
 *
 * Every failure path returns null rather than throwing: a brief that will
 * not generate because a logo did not load is worse than a brief with no
 * logo on it.
 */

const LOGO_URL = '/logos/whitehart.jpg';
const WIDTH_MM = 16;

let cached;

export async function loadLogo() {
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    cached = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Draws the mark in the top right and returns its height in mm, so the
 * caller can keep the meta block clear of it.
 */
export function drawLogo(doc, dataUrl, { x, y, width = WIDTH_MM } = {}) {
  if (!dataUrl) return 0;
  try {
    const props = doc.getImageProperties(dataUrl);
    const height = (props.height / props.width) * width;
    doc.addImage(dataUrl, 'JPEG', x, y, width, height);
    return height;
  } catch {
    return 0;
  }
}

export const LOGO_WIDTH_MM = WIDTH_MM;
