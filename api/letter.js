// /api/letter.js — Vercel Serverless Function (ohne API-Key)
const {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
} = require('pdf-lib');

const mm2pt = mm => mm * 2.834645669;
const A4 = { width: 595.28, height: 841.89 };

// Fenster-Position (DIN/AT üblich)
const WINDOW_MM = { left: 20, top: 45, width: 90, height: 45 };

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, usage: 'POST /api/letter { adresse, plzOrt, text? }' });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with JSON body' });

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

    // === PDF ===
    const pdf = await PDFDocument.create();
    const times = await pdf.embedStandardFont(StandardFonts.TimesRoman);
    const timesBold = await pdf.embedStandardFont(StandardFonts.TimesRomanBold);
    const page = pdf.addPage([A4.width, A4.height]);

    // AcroForm & Default-Appearance auf Times setzen (robuster /DA-Fix)
    const form = pdf.getForm();
    const acro = form.acroForm;
    if (acro) {
      const dr = pdf.context.obj({});
      const fonts = pdf.context.obj({});
      fonts.set(PDFName.of('TiRo'), times.ref); // /TiRo -> TimesRoman
      dr.set(PDFName.of('Font'), fonts);
      acro.dict.set(PDFName.of('DR'), dr);
      acro.dict.set(PDFName.of('DA'), PDFString.of('/TiRo 12 Tf 0 g')); // 12pt, schwarz
    }

    // Fenster (mit Überschrift)
    const winX = mm2pt(WINDOW_MM.left);
    const winW = mm2pt(WINDOW_MM.width);
    const winH = mm2pt(WINDOW_MM.height);
    const winY = A4.height - mm2pt(WINDOW_MM.top) - winH;

    // Überschrift im Fenster
    const heading = 'An die neuen Eigentümer';
    const headingSize = 12;
    const headingY = winY + winH - headingSize - 2;
    page.drawText(heading, { x: winX, y: headingY, size: headingSize, font: timesBold, color: rgb(0,0,0) });

    // Editierbares Adressfeld (Times als /DA)
    const fieldPad = 2;
    const fieldH = winH - (headingSize + fieldPad);
    const addrField = form.createTextField('anschrift');
    addrField.enableMultiline();
    addrField.addToPage(page, { x: winX, y: winY, width: winW, height: fieldH, borderWidth: 0 });
    const addressBlock = [(adresse || 'Bahnstraße 17'), (plzOrt || '2404 Petronell')].join('\n');
    addrField.setText(addressBlock);
    if (addrField.acroField && addrField.acroField.dict) {
      addrField.acroField.dict.set(PDFName.of('DA'), PDFString.of('/TiRo 12 Tf 0 g'));
    }

    // Text-Layout-Parameter
    const size = 12;
    const lineGap = 2;                     // zusätzlicher Zeilenabstand
    const lineStep = () => times.heightAtSize(size) + lineGap;
    const marginLeft = mm2pt(25);
    const marginRight = mm2pt(20);
    const contentWidth = A4.width - marginLeft - marginRight;

    // etwas mehr Luft unter dem Fenster
    let y = winY - mm2pt(15);

    // Textumbruch
    const wrap = (text, font, maxWidth) => {
      const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ');
      const lines = []; let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= maxWidth) line = t;
        else { if (line) lines.push(line); line = w; }
      }
      if (line) lines.push(line);
      return lines;
    };

    // Absätze mit Bullet-Erkennung
    const drawParagraph = (txt, bold = false) => {
      const font = bold ? timesBold : times;
      const paras = txt.split('\n\n');
      for (const pRaw of paras) {
        const linesRaw = pRaw.split('\n');
        for (let i = 0; i < linesRaw.length; i++) {
          const line = linesRaw[i].trim();
          if (!line) { y -= lineStep(); continue; }

          // Bullet-Zeilen erkennen: beginnen mit "• "
          if (line.startsWith('•')) {
            const label = '•';
            const text = line.replace(/^•\s*/, '');
            const bulletIndent = mm2pt(6);
            // Bullet
            page.drawText(label, { x: marginLeft, y, size, font: timesBold });
            // Eingezogene Zeile
            const xStart = marginLeft + bulletIndent;
            const w = contentWidth - bulletIndent;
            const wrapped = wrap(text, font, w);
            for (const l of wrapped) {
              page.drawText(l, { x: xStart, y, size, font, color: rgb(0,0,0) });
              y -= lineStep();
            }
          } else {
            // normale Zeile
            const wrapped = wrap(line, font, contentWidth);
            for (const l of wrapped) {
              page.drawText(l, { x: marginLeft, y, size, font, color: rgb(0,0,0) });
              y -= lineStep();
            }
          }
        }
        y -= lineStep(); // Absatzabstand
      }
    };

    drawParagraph('Sehr geehrte Damen und Herren,');
    drawParagraph('\n' + contentBody);

    // Kontaktzeilen (untereinander, klickbar)
    const contact = [
      ['T: ', '+43 1 774 20 32', 'tel:+4317742032'],
      ['E: ', 'info@wisehomes.at', 'mailto:info@wisehomes.at'],
      ['W: ', 'wisehomes.at', 'https://wisehomes.at'],
    ];
    for (const [label, val, href] of contact) {
      if (y < mm2pt(20)) break;
      page.drawText(label, { x: marginLeft, y, size, font: times });
      const xVal = marginLeft + times.widthOfTextAtSize(label, size);
      page.drawText(val, { x: xVal, y, size, font: times, link: href });
      y -= lineStep();
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
