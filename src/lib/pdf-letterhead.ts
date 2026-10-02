/**
 * The letterhead for PDF exports: the homepage logo (public/brand/logo.png)
 * top-left, the report title and lines beneath it. Browser-only — it fetches
 * the logo from the app's own origin.
 */
import type { jsPDF } from 'jspdf';

const LOGO_SRC = '/brand/logo.png';
const LOGO_RATIO = 182 / 869; // height / width of the wordmark

let cached: Promise<string | null> | null = null;

/** The logo as a data URL, loaded once per page. Null if it cannot be fetched. */
function loadLogo(): Promise<string | null> {
  cached ??= fetch(LOGO_SRC)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        })
    )
    .catch(() => null);
  return cached;
}

/**
 * Draw the letterhead and return the y position (mm) where content may start.
 * Falls back to the company name in text if the logo cannot be loaded.
 */
export async function addLetterhead(doc: jsPDF, title: string, lines: string[] = []): Promise<number> {
  const left = 14;
  const logo = await loadLogo();
  let y = 10;
  if (logo) {
    const width = 48;
    doc.addImage(logo, 'PNG', left, y, width, width * LOGO_RATIO);
    y += width * LOGO_RATIO + 7;
  } else {
    doc.setFontSize(16);
    doc.text('HY-LINK Finance Limited', left, y + 5);
    y += 12;
  }
  doc.setFontSize(13);
  doc.text(title, left, y);
  y += 6;
  doc.setFontSize(9);
  for (const line of lines) {
    doc.text(line, left, y);
    y += 5;
  }
  return y + 2;
}
