// /api/letter.js  — Vercel Serverless Function (ohne API-Key)
// POST JSON: { "adresse": "Bahnstraße 17", "plzOrt": "2404 Petronell", "text": "optional" }

const {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
} = require('pdf-lib');

const mm2pt = (mm) => mm * 2.834645669;
const A4 = { width: 595.28, height: 841.89 };
// Fenster-Position (DIN/AT-typisch). Bei Bedarf anpassen.
const WINDOW_MM = { left: 20, top: 45, width: 90, height: 45 };

function wrapText(text, font, size, maxWidth) {
  const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = []; let line = '';
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
    // Healthcheck für Browser
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, usage: 'POST /api/letter { adresse, plzOrt, text? }' });
    }

    // CORS / Methoden
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with JSON body' });

    // Body robust parsen
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    if (!b || typeof b !== 'object') b = {};

    const adresse = (b.adresse ?? b.address ?? b.Adresse ?? '').toString().trim();
    const plzOrt  = (b['plz/ort'] ?? b['PLZ/Ort'] ?? b.plzOrt ?? b.plz_ort ?? b.plzort ?? '').toString().trim();

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

    // ---- PDF aufbauen (Times überall) ----
    const pdf = await PDFDocument.create();
    const times = await pdf.embedStandardFont(StandardFonts.TimesRoman);
    const timesBold = await pdf.embedStandardFont(StandardFonts.TimesRomanBold);
    const page = pdf.addPage([A4.width, A4.height]);

    // AcroForm + Default-Appearance auf TIMES setzen (robuster /DA-Fix)
    const form = pdf.getForm();
    const acro = form.acroForm;
    if (acro) {
      const drDict = pdf.context.obj({});
      const fontsDict = pdf.context.obj({});
      fontsDict.set(PDFName.of('TiRo'), times.ref);             // /TiRo -> TimesRoman
      drDict.set(PDFName.of('Font'), fontsDict);
      acro.dict.set(PDFName.of('DR'), drDict);
      acro.dict.set(PDFName.of('DA'), PDFString.of('/TiRo 12 Tf 0 g')); // 12pt Times, schwarz
    }

    // --- Fensterbereich mit Überschrift ---
    const winX = mm2pt(WINDOW_MM.left);
    const winW = mm2pt(WINDOW_MM.width);
    const winH = mm2pt(WINDOW_MM.height);
    const winY = A4.height - mm2pt(WINDOW_MM.top) - winH;

    // Überschrift im Fenster (statisch)
    const heading = 'An die neuen Eigentümer';
    const headingSize = 12;
    const yTop = winY + winH;
    const headingY = yTop - headingSize - 2; // 2pt Padding
    page.drawText(heading, { x: winX, y: headingY, size: headingSize, font: timesBold, color: rgb(0,0,0) });

    // Editierbares Adressfeld direkt UNTER der Überschrift
    const fieldPad = 2;
    const fieldY = winY;
    const fieldH = winH - (headingSize + fieldPad);
    const addrField = form.createTextField('anschrift');
    addrField.enableMultiline();
    addrField.addToPage(page, {
      x: winX, y: fieldY, width: winW, height: fieldH, borderWidth: 0
    });

    const addressBlock = [
      adresse || 'Bahnstraße 17',
      plzOrt  || '2404 Petronell',
    ].join('\n');
    addrField.setText(addressBlock);

    // Feld-/Widget-Appearance: ebenfalls Times
    if (addrField.acroField && addrField.acroField.dict) {
      addrField.acroField.dict.set(PDFName.of('DA'), PDFString.of('/TiRo 12 Tf 0 g'));
    }
    addrField.updateAppearances(times);

    // --- Brieftext (Times 12, einheitlich) ---
    const marginLeft = mm2pt(25);
    const marginRight = mm2pt(20);
    const contentWidth = A4.width - marginLeft - marginRight;
    const size = 12;
    const lineGap = 4;
    let y = fieldY - mm2pt(10); // Abstand unter dem Fenster

    function drawParagraph(txt, bold = false) {
      const font = bold ? timesBold : times;
      const paragraphs = txt.split('\n\n');
      for (const p of paragraphs) {
        const lines = wrapText(p, font, size, contentWidth);
        for (const line of lines) {
          const h = font.heightAtSize(size);
          if (y - h < mm2pt(15)) y = A4.height - mm2pt(25); // einfacher Seitenumbruch (eine Seite reicht hier i.d.R.)
          page.drawText(line, { x: marginLeft, y, size, font, color: rgb(0,0,0) });
          y -= h + lineGap;
        }
        y -= mm2pt(2);
      }
    }

    drawParagraph('Sehr geehrte Damen und Herren,');
    drawParagraph('\n' + contentBody);

    // --- Kontaktzeile (Times, klickbare Links, eigene Zeilen für Klarheit) ---
    const contactSize = 12;
    const contactFont = times;
    const contactLines = [
      ['T: ', '+43 1 774 20 32', 'tel:+4317742032'],
      ['E: ', 'info@wisehomes.at', 'mailto:info@wisehomes.at'],
      ['W: ', 'wisehomes.at', 'https://wisehomes.at'],
    ];
    y -= mm2pt(2);
    for (const [label, val, href] of contactLines) {
      if (y < mm2pt(20)) break;
      page.drawText(label, { x: marginLeft, y, size: contactSize, font: contactFont });
      const xVal = marginLeft + contactFont.widthOfTextAtSize(label, contactSize);
      page.drawText(val, { x: xVal, y, size: contactSize, font: contactFont, link: href });
      y -= contactFont.heightAtSize(contactSize) + 2;
    }

    const bytes = await pdf.save();
    res.status(200).json({
      fileName: 'wisehomes_brief.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from(bytes).toString('base64'),
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal error', details: String(e?.message || e) });
  }
};
