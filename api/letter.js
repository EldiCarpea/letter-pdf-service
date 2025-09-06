// /api/letter.js — Vercel Serverless Function (Node 20, ohne API-Key)
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

// Fenster-Position (DL/C6/5, links). Bei Bedarf feinjustieren.
const WINDOW_MM = { left: 20, top: 45, width: 90, height: 45 };

// Logo (wird oben rechts platziert)
const LOGO_URL = 'https://wisehomes.at/wp-content/uploads/2025/05/wisehomes-color@0.5x.png';
const LOGO_WIDTH_PT = 120; // Breite in pt (~42mm)

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, usage: 'POST /api/letter { adresse, plzOrt, text? }' });
    }

    // CORS
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

    // === PDF ===
    const pdf = await PDFDocument.create();
    const helv = await pdf.embedStandardFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedStandardFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([A4.width, A4.height]);

    // Formular + Default-Appearance (/DA) auf Helvetica (modern, einheitlich)
    const form = pdf.getForm();
    const acro = form.acroForm;
    if (acro) {
      const dr = pdf.context.obj({});
      const fonts = pdf.context.obj({});
      fonts.set(PDFName.of('Helv'), helv.ref);                   // /Helv -> Helvetica
      dr.set(PDFName.of('Font'), fonts);
      acro.dict.set(PDFName.of('DR'), dr);
      acro.dict.set(PDFName.of('DA'), PDFString.of('/Helv 12 Tf 0 g'));
    }

    // Logo laden & platzieren (top-right, oberhalb des Fensters)
    try {
      const r = await fetch(LOGO_URL);
      if (r.ok) {
        const arr = new Uint8Array(await r.arrayBuffer());
        const img = await pdf.embedPng(arr);
        const scale = LOGO_WIDTH_PT / img.width;
        const w = img.width * scale, h = img.height * scale;
        const x = A4.width - mm2pt(20) - w;                      // rechter Rand 20mm
        const y = A4.height - mm2pt(15) - h;                     // oberer Rand 15mm
        page.drawImage(img, { x, y, width: w, height: h });
      }
    } catch (_) {
      // Logo optional – bei Fehlern ignorieren
    }

    // Fenster mit Heading + editierbarer Adresse
    const winX = mm2pt(WINDOW_MM.left);
    const winW = mm2pt(WINDOW_MM.width);
    const winH = mm2pt(WINDOW_MM.height);
    const winY = A4.height - mm2pt(WINDOW_MM.top) - winH;

    // Heading im Fenster
    const heading = 'An die neuen Eigentümer';
    const headingSize = 12;
    page.drawText(heading, { x: winX, y: winY + winH - headingSize - 1, size: headingSize, font: helvBold });

    // Adressfeld
    const fieldTopPadding = 3;
    const fieldH = winH - (headingSize + fieldTopPadding);
    const addrField = form.createTextField('anschrift');
    addrField.enableMultiline();
    addrField.addToPage(page, { x: winX, y: winY, width: winW, height: fieldH, borderWidth: 0 });
    const addressBlock = [(adresse || 'Bahnstraße 17'), (plzOrt || '2404 Petronell')].join('\n');
    addrField.setText(addressBlock);
    if (addrField.acroField && addrField.acroField.dict) {
      addrField.acroField.dict.set(PDFName.of('DA'), PDFString.of('/Helv 12 Tf 0 g'));
    }
    addrField.updateAppearances(helv);

    // Layout-Parameter
    const size = 12;
    const lineGap = 3; // moderner, luftiger
    const lineStep = () => helv.heightAtSize(size) + lineGap;
    const marginLeft = mm2pt(25), marginRight = mm2pt(20);
    const contentWidth = A4.width - marginLeft - marginRight;

    // Start Y (unter Fenster + Luft)
    let y = winY - mm2pt(18);

    // Helfer: weicher Umbruch
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

    // Zeichnet Absätze, erkennt Überschriften/Ergebnis/Bullets
    const drawParagraphsSmart = (txt) => {
      const paras = txt.split('\n\n');

      for (const raw of paras) {
        const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length) { y -= lineStep(); continue; }

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];

          // fette Einzeiler
          const isBoldOneLiner =
            line === 'herzlichen Glückwunsch zum Auktionszuschlag!' ||
            line === 'Was wir für Sie unkompliziert aus einer Hand übernehmen:' ||
            line.startsWith('Ergebnis:');

          // Bullets mit fett gesetztem „Bereichstitel“
          if (line.startsWith('• ')) {
            const label = '•';
            const rest = line.replace(/^•\s*/, '');
            const bulletIndent = mm2pt(6);

            // Bereichstitel fett, wenn nur ein Wortpaar? -> wir setzen einfach die erste Zeile fett
            const wrapped = wrap(rest, helv, contentWidth - bulletIndent);
            if (wrapped.length) {
              // erste Zeile fett
              page.drawText(label, { x: marginLeft, y, size, font: helvBold });
              page.drawText(wrapped[0], { x: marginLeft + bulletIndent, y, size, font: helvBold });
              y -= lineStep();
              // weitere Zeilen normal
              for (let k = 1; k < wrapped.length; k++) {
                page.drawText(wrapped[k], { x: marginLeft + bulletIndent, y, size, font: helv });
                y -= lineStep();
              }
            }
            continue;
          }

          // Ergebnis: – fett label, rest normal
          if (line.startsWith('Ergebnis:')) {
            const label = 'Ergebnis: ';
            const rest = line.replace(/^Ergebnis:\s*/, '');
            page.drawText(label, { x: marginLeft, y, size, font: helvBold });
            const x2 = marginLeft + helvBold.widthOfTextAtSize(label, size);
            const w2 = contentWidth - (x2 - marginLeft);
            const wrapped = wrap(rest, helv, w2);
            for (const w of wrapped) {
              page.drawText(w, { x: x2, y, size, font: helv });
              y -= lineStep();
            }
            continue;
          }

          // normale oder fette Zeilen
          const font = isBoldOneLiner ? helvBold : helv;
          const wrapped = wrap(line, font, contentWidth);
          for (const w of wrapped) {
            page.drawText(w, { x: marginLeft, y, size, font });
            y -= lineStep();
          }
        }

        // Absatzabstand
        y -= lineGap;
      }
    };

    // Anrede + Haupttext
    const intro = 'Sehr geehrte Damen und Herren,';
    for (const w of wrap(intro, helv, contentWidth)) {
      page.drawText(w, { x: marginLeft, y, size, font: helv });
      y -= lineStep();
    }
    y -= lineStep(); // Leerzeile
    drawParagraphsSmart('\n' + contentBody);

    // dünne Trennlinie vor Kontakt
    y -= mm2pt(2);
    page.drawRectangle({ x: marginLeft, y, width: contentWidth, height: 0.5, color: rgb(0,0,0) });
    y -= mm2pt(4);

    // Kontakt (untereinander, klickbar)
    const contact = [
      ['Telefon', '+43 1 774 20 32', 'tel:+4317742032'],
      ['E-Mail', 'info@wisehomes.at', 'mailto:info@wisehomes.at'],
      ['Web', 'wisehomes.at', 'https://wisehomes.at'],
    ];
    for (const [label, val, href] of contact) {
      if (y < mm2pt(20)) break;
      const lab = `${label}: `;
      page.drawText(lab, { x: marginLeft, y, size, font: helvBold });
      const xVal = marginLeft + helvBold.widthOfTextAtSize(lab, size);
      page.drawText(val, { x: xVal, y, size, font: helv, link: href });
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
