// /api/letter.js
// POST JSON: { "adresse": "Bahnstraße 17", "plzOrt": "2404 Petronell", "text": "optional" }
// Aliase akzeptiert: address, Adresse, "plz/ort", PLZ/Ort, plz_ort, plzort, body

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// --- Helpers & Layout ---
const mm2pt = (mm) => mm * 2.834645669;
const A4 = { width: 595.28, height: 841.89 }; // pt
// Standard-Fenster links (DL/C6/5): 20 mm von links, 45 mm von oben, 90x45 mm
const WINDOW_MM = { left: 20, top: 45, width: 90, height: 45 };

function wrapText(text, font, size, maxWidth) {
  const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

module.exports = async (req, res) => {
  try {
    // --- CORS / Methoden ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with JSON body' });

    // --- Eingaben ---
    const b = req.body || {};
    const adresse =
      (b.adresse ?? b.address ?? b.Adresse ?? '').toString().trim();
    const plzOrt =
      (b['plz/ort'] ?? b['PLZ/Ort'] ?? b.plzOrt ?? b.plz_ort ?? b.plzort ?? '').toString().trim();

    const addressBlock = [
      adresse || 'Bahnstraße 17',
      plzOrt  || '2404 Petronell',
    ].join('\n');

    const defaultBody = `herzlichen Glückwunsch zum Auktionszuschlag!

Wir sind Wisehomes.at, ein Full-Service-Bauträger aus Wien mit Schwerpunkt auf Ziegelmassivbau von Einfamilien- und Doppelhäusern in Wien, Niederösterreich und Burgenland. Wir scouten regelmäßig vielversprechende Projekte auf öffentlichen Auktions- und Amtsportalen. Dabei ist uns diese Liegenschaft besonders positiv aufgefallen. Da sie fachlich hervorragend zu uns passt, haben wir uns entschieden, Sie direkt zu kontaktieren – in der Überzeugung, dass hier beste Voraussetzungen für eine erfolgreiche Zusammenarbeit bestehen.

Was wir für Sie unkompliziert aus einer Hand übernehmen:
• Planung und Design
Von der Bestandsaufnahme und einem Bauordnungs- bzw. Bebauungsplan-Check über Variantenstudien und Visualisierungen bis zur Einreichplanung.
Ergebnis: ein stimmiges Konzept, das technisch machbar, wirtschaftlich sinnvoll und behördlich genehmigungsfähig ist.
• Bau und Übergabe
Koordination aller Gewerke, verlässliche Zeit- und Kostensteuerung, Qualitätssicherung auf der Baustelle, saubere Abnahmen und am Ende die schlüsselfertige Übergabe.
Ergebnis: Sie haben nur einen Ansprechpartner, wir kümmern uns um den Rest.
• Finanzierung und Betreuung
Transparente Kostenstruktur, Zahlungsplan je Baufortschritt, auf Wunsch Kontakt zu Finanzierungs- und Förderstellen sowie Begleitung nach der Übergabe (Gewährleistung, Nachjustierungen).
Ergebnis: Planungssicherheit statt Überraschungen.

Unser Vorschlag: Lassen Sie uns ein kurzes, kostenloses Erstgespräch (vor Ort oder online) ansetzen. Danach haben Sie eine klare Basis, um zu entscheiden, wie Sie mit dieser Liegenschaft weitergehen möchten.

Wenn das für Sie interessant klingt, teilen Sie uns einfach kurz Ihre Wunschzeiten mit – wir richten uns gerne nach Ihrem Kalender. Sie können uns jederzeit direkt per Mail oder telefonisch erreichen.

Mit besten Grüßen
Eldi Neziri
Projektberater Wohnbau
T: +43 1 774 20 32 · E: info@wisehomes.at · W: wisehomes.at`;

    const contentBody = (b.text ?? b.body ?? defaultBody).toString();

    // --- PDF erstellen ---
    const pdf = await PDFDocument.create();
    const fontRegular = await pdf.embedStandardFont(StandardFonts.TimesRoman);
    const fontBold    = await pdf.embedStandardFont(StandardFonts.TimesRomanBold);
    const formFont    = await pdf.embedStandardFont(StandardFonts.Helvetica);

    const page = pdf.addPage([A4.width, A4.height]);
    const form = pdf.getForm();
    // ❗ Kein form.updateFieldAppearances() hier – erst NACH dem Feldanlegen!

    // --- Fensteradresse (editierbares Feld) ---
    const winX = mm2pt(WINDOW_MM.left);
    const winW = mm2pt(WINDOW_MM.width);
    const winH = mm2pt(WINDOW_MM.height);
    const winY = A4.height - mm2pt(WINDOW_MM.top) - winH;

    const addrField = form.createTextField('anschrift');
    addrField.enableMultiline();
    addrField.setFontSize(12);
    addrField.setBorderWidth(0);

    // Erst auf die Seite, dann Text setzen, DANN Appearances updaten
    addrField.addToPage(page, { x: winX, y: winY, width: winW, height: winH });
    addrField.setText(addressBlock);
    // Wichtig: Appearance/DA generieren – sonst 500er
    form.updateFieldAppearances(formFont);

    // --- Brieftext layouten ---
    const marginLeft = mm2pt(25);
    const marginRight = mm2pt(20);
    const contentWidth = A4.width - marginLeft - marginRight;
    const size = 12;
    const lineGap = 4;
    let y = winY - mm2pt(12);

    function drawParagraph(txt, bold = false) {
      const font = bold ? fontBold : fontRegular;
      const paragraphs = txt.split('\n\n');
      for (const p of paragraphs) {
        const lines = wrapText(p, font, size, contentWidth);
        for (const line of lines) {
          const h = font.heightAtSize(size);
          if (y - h < mm2pt(15)) y = A4.height - mm2pt(25); // einfacher Umbruch
          page.drawText(line, { x: marginLeft, y, size, font, color: rgb(0, 0, 0) });
          y -= h + lineGap;
        }
        y -= mm2pt(2);
      }
    }

    drawParagraph('Sehr geehrte Damen und Herren,');
    drawParagraph('\n' + contentBody);

    // --- Kontaktzeile (klickbare Links) ---
    let x = marginLeft;
    const baseY = y;
    const contact = [
      ['T: ', '+43 1 774 20 32', 'tel:+4317742032'],
      [' · E: ', 'info@wisehomes.at', 'mailto:info@wisehomes.at'],
      [' · W: ', 'wisehomes.at', 'https://wisehomes.at'],
    ];
    for (const [label, val, href] of contact) {
      page.drawText(label, { x, y: baseY, size, font: fontRegular });
      x += fontRegular.widthOfTextAtSize(label, size);
      page.drawText(val, { x, y: baseY, size, font: fontRegular, link: href });
      x += fontRegular.widthOfTextAtSize(val, size);
    }

    const bytes = await pdf.save();
    return res.status(200).json({
      fileName: 'wisehomes_brief.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from(bytes).toString('base64'),
    });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', details: String(e?.message || e) });
  }
};
