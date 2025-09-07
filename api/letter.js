// /api/letter.js — Vercel Serverless Function (Node 20, ohne API-Key)
// POST JSON: { "adresse": "Bahnstraße 17", "plzOrt": "2404 Petronell", "text": "...optional...", "betreff": "...optional..." }

const {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
} = require('pdf-lib');

const mm2pt = (mm) => mm * 2.834645669;
const A4 = { width: 595.28, height: 841.89 };

// Fensterposition (DL/C6/5)
const WINDOW_MM = { left: 20, top: 45, width: 90, height: 45 };

// Logo
const LOGO_URL = 'https://wisehomes.at/wp-content/uploads/2025/05/wisehomes-color@0.5x.png';
const LOGO_WIDTH_PT = 120; // ~42mm

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, usage: 'POST /api/letter { adresse, plzOrt, text?, betreff? }' });
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
    const betreff = (b.betreff ?? '').toString().trim() || 'Unverbindliches Erstgespräch zur Liegenschaft';

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

    // Seite 1 anlegen
    const page1 = pdf.addPage([A4.width, A4.height]);

    // AcroForm + Default-Appearance (/DA) auf Helvetica (robust gegen /DA-Fehler)
    const form = pdf.getForm();
    const acro = form.acroForm;
    if (acro) {
      const dr = pdf.context.obj({});
      const fonts = pdf.context.obj({});
      fonts.set(PDFName.of('Helv'), helv.ref);
      dr.set(PDFName.of('Font'), fonts);
      acro.dict.set(PDFName.of('DR'), dr);
      acro.dict.set(PDFName.of('DA'), PDFString.of('/Helv 11 Tf 0 g'));
    }

    // Logo oben rechts (optional)
    try {
      const r = await fetch(LOGO_URL);
      if (r.ok) {
        const arr = new Uint8Array(await r.arrayBuffer());
        const img = await pdf.embedPng(arr);
        const scale = LOGO_WIDTH_PT / img.width;
        const w = img.width * scale, h = img.height * scale;
        const x = A4.width - mm2pt(20) - w;  // rechter Rand 20mm
        const y = A4.height - mm2pt(15) - h; // oberer Rand 15mm
        page1.drawImage(img, { x, y, width: w, height: h });
      }
    } catch {}

    // Fenster- & Layout-Parameter (linker Text-Rand = Fenster links)
    const winX = mm2pt(WINDOW_MM.left);
    const winW = mm2pt(WINDOW_MM.width);
    const winH = mm2pt(WINDOW_MM.height);
    const winY = A4.height - mm2pt(WINDOW_MM.top) - winH;

    const marginLeft = winX;
    const marginRight = mm2pt(20);
    const contentWidth = A4.width - marginLeft - marginRight;

    // Editierbares Feld (inkl. „An die neuen Eigentümer“)
    const addrField = form.createTextField('anschrift');
    addrField.enableMultiline();
    addrField.addToPage(page1, { x: winX, y: winY, width: winW, height: winH, borderWidth: 0 });
    const editableBlock = [
      'An die neuen Eigentümer',
      adresse || 'Bahnstraße 17',
      plzOrt  || '2404 Petronell'
    ].join('\n');
    addrField.setText(editableBlock);
    if (addrField.acroField && addrField.acroField.dict) {
      // im Fenster etwas kleiner
      addrField.acroField.dict.set(PDFName.of('DA'), PDFString.of('/Helv 10 Tf 0 g'));
    }
    addrField.updateAppearances(helv);

    // Typografie
    const size = 11;                  // Fließtext
    const lineGap = 4;                // luftiger Zeilenabstand
    const lineStep = () => helv.heightAtSize(size) + lineGap;

    // Textumbruch
    const wrap = (text, font, width) => {
      const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ');
      const lines = []; let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= width) line = t;
        else { if (line) lines.push(line); line = w; }
      }
      if (line) lines.push(line);
      return lines;
    };

    // Zeichenfunktionen (seitenbezogen)
    const drawBlockOn = (page, text, font, ctx) => {
      for (const l of wrap(text, font, ctx.contentWidth)) {
        page.drawText(l, { x: ctx.marginLeft, y: ctx.y, size, font });
        ctx.y -= lineStep();
      }
    };

    const drawParagraphsSmartOn = (page, raw, ctx) => {
      const paras = raw.split('\n\n');
      for (const para of paras) {
        const lines = para.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length) { ctx.y -= lineStep(); continue; }

        for (const line of lines) {
          // Bullets
          if (line.startsWith('• ')) {
            const bulletIndent = mm2pt(6);
            const rest = line.replace(/^•\s*/, '');
            const wrapped = wrap(rest, helv, ctx.contentWidth - bulletIndent);
            page.drawText('•', { x: ctx.marginLeft, y: ctx.y, size, font: helvBold });
            if (wrapped[0]) {
              page.drawText(wrapped[0], { x: ctx.marginLeft + bulletIndent, y: ctx.y, size, font: helvBold });
              ctx.y -= lineStep();
            }
            for (let k = 1; k < wrapped.length; k++) {
              page.drawText(wrapped[k], { x: ctx.marginLeft + bulletIndent, y: ctx.y, size, font: helv });
              ctx.y -= lineStep();
            }
            continue;
          }

          // „Ergebnis:“ fett als Label
          if (line.startsWith('Ergebnis:')) {
            const label = 'Ergebnis: ';
            const rest = line.slice(label.length);
            page.drawText(label, { x: ctx.marginLeft, y: ctx.y, size, font: helvBold });
            const x2 = ctx.marginLeft + helvBold.widthOfTextAtSize(label, size);
            const w2 = ctx.contentWidth - (x2 - ctx.marginLeft);
            for (const l of wrap(rest, helv, w2)) {
              page.drawText(l, { x: x2, y: ctx.y, size, font: helv });
              ctx.y -= lineStep();
            }
            continue;
          }

          // fette Einzeiler / Überschriften
          const isBold =
            line === 'herzlichen Glückwunsch zum Auktionszuschlag!' ||
            line === 'Was wir für Sie unkompliziert aus einer Hand übernehmen:';

          drawBlockOn(page, line, isBold ? helvBold : helv, ctx);
        }
        ctx.y -= lineGap; // Absatzabstand
      }
    };

    // === Seite 1 Inhalt ===
    const ctx1 = { marginLeft, contentWidth, y: winY - mm2pt(25) }; // etwas mehr Luft unterm Fenster

    // Anrede
    drawBlockOn(page1, 'Sehr geehrte Damen und Herren,', helv, ctx1);
    ctx1.y -= lineStep();

    // Betreff (fett, mit „Betreff:“)
    const subject = betreff.startsWith('Betreff:') ? betreff : `Betreff: ${betreff}`;
    drawBlockOn(page1, subject, helvBold, ctx1);
    ctx1.y -= lineStep();

    // Haupttext
    drawParagraphsSmartOn(page1, '\n' + contentBody, ctx1);

    // Trennlinie + Kontakt (unten Seite 1)
    ctx1.y -= mm2pt(4);
    page1.drawRectangle({ x: marginLeft, y: ctx1.y, width: contentWidth, height: 0.5, color: rgb(0,0,0) });
    ctx1.y -= mm2pt(6);

    const contact = [
      ['Telefon', '+43 1 774 20 32', 'tel:+4317742032'],
      ['E-Mail', 'info@wisehomes.at', 'mailto:info@wisehomes.at'],
      ['Web', 'wisehomes.at', 'https://wisehomes.at'],
    ];
    for (const [label, val, href] of contact) {
      if (ctx1.y < mm2pt(20)) break;
      const lab = `${label}: `;
      page1.drawText(lab, { x: marginLeft, y: ctx1.y, size, font: helvBold });
      const xVal = marginLeft + helvBold.widthOfTextAtSize(lab, size);
      page1.drawText(val, { x: xVal, y: ctx1.y, size, font: helv, link: href });
      ctx1.y -= lineStep();
    }

    // === Seite 2 (Rückseite) ===
    const page2 = pdf.addPage([A4.width, A4.height]);
    const ctx2 = {
      marginLeft: mm2pt(20), // etwas enger, „Flyer“-Feeling
      contentWidth: A4.width - mm2pt(20) - mm2pt(20),
      y: A4.height - mm2pt(25),
    };

    // Überschrift Rückseite
    page2.drawText('Über Wisehomes', { x: ctx2.marginLeft, y: ctx2.y, size: 13, font: helvBold });
    ctx2.y -= helv.heightAtSize(13) + 6;

    const aboutBlocks = [
      'Wir sind ein Full-Service-Bauträger mit Fokus auf Ziegelmassivbau – von der Idee bis zur schlüsselfertigen Übergabe. Wir vereinen Planung, Bau und Kostensteuerung aus einer Hand.',
      'Warum wir? Klare Kommunikation, verlässliche Termine, transparente Kosten. Sie haben einen Ansprechpartner, wir kümmern uns um den Rest.',
      'Leistungen im Überblick:',
      '• Konzept & Entwurf – Varianten, Visualisierungen, Einreichungen',
      '• Bauleitung & Qualität – Zeit-/Kostensteuerung, Baustellen-Qualitätssicherung',
      '• Finanzierung & Förderung – Begleitung zu Förderstellen, Zahlungsplan je Baufortschritt',
    ];

    for (const block of aboutBlocks) {
      if (block.startsWith('• ')) {
        // Bullet
        const bulletIndent = mm2pt(6);
        const rest = block.replace(/^•\s*/, '');
        page2.drawText('•', { x: ctx2.marginLeft, y: ctx2.y, size, font: helvBold });
        for (const l of wrap(rest, helv, ctx2.contentWidth - bulletIndent)) {
          page2.drawText(l, { x: ctx2.marginLeft + bulletIndent, y: ctx2.y, size, font: helv });
          ctx2.y -= lineStep();
        }
        ctx2.y -= 2;
      } else {
        // normal/fett (Titel)
        const isTitle = block.endsWith(':');
        for (const l of wrap(block, isTitle ? helvBold : helv, ctx2.contentWidth)) {
          page2.drawText(l, { x: ctx2.marginLeft, y: ctx2.y, size, font: isTitle ? helvBold : helv });
          ctx2.y -= lineStep();
        }
        ctx2.y -= 2;
      }
    }

    // Footer Rückseite
    ctx2.y -= mm2pt(4);
    page2.drawRectangle({ x: ctx2.marginLeft, y: ctx2.y, width: ctx2.contentWidth, height: 0.5, color: rgb(0,0,0) });
    ctx2.y -= mm2pt(6);
    const footer = [
      ['Telefon', '+43 1 774 20 32', 'tel:+4317742032'],
      ['E-Mail', 'info@wisehomes.at', 'mailto:info@wisehomes.at'],
      ['Web', 'wisehomes.at', 'https://wisehomes.at'],
      ['Adresse', 'Wien / Niederösterreich / Burgenland', null],
    ];
    for (const [label, val, href] of footer) {
      const lab = `${label}: `;
      page2.drawText(lab, { x: ctx2.marginLeft, y: ctx2.y, size, font: helvBold });
      const xVal = ctx2.marginLeft + helvBold.widthOfTextAtSize(lab, size);
      page2.drawText(val, { x: xVal, y: ctx2.y, size, font: helv, link: href || undefined });
      ctx2.y -= lineStep();
    }

    // Ausgabe
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
