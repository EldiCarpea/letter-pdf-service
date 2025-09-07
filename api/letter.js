// /api/letter.js — Vercel Serverless Function (Node 20, ohne API-Key)
// POST JSON: { "adresse": "Bahnstraße 17", "plzOrt": "2404 Petronell", "text": "optional override" }

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
const LOGO_URL =
  'https://wisehomes.at/wp-content/uploads/2025/05/wisehomes-color@0.5x.png';
const LOGO_WIDTH_PT = 110; // ~39 mm

// Dein Brieftext (kompakt, 1 Seite)
const DEFAULT_TEXT = `Sehr geehrte Damen und Herren,

herzlichen Glückwunsch zum Auktionszuschlag.

Wir sind Wisehomes.at, ein Full-Service-Bauträger aus Wien mit Schwerpunkt auf
Ziegelmassivbau von Einfamilien- und Doppelhäusern in Wien, Niederösterreich und Burgenland.
Wir scouten regelmäßig vielversprechende Projekte auf öffentlichen Auktions- und Amtsportalen.
Dabei ist uns diese Liegenschaft besonders positiv aufgefallen. Da sie fachlich hervorragend zu
uns passt, haben wir uns entschieden, Sie direkt zu kontaktieren – in der Überzeugung, dass hier
beste Voraussetzungen für eine erfolgreiche Zusammenarbeit bestehen.
Was wir für Sie aus einer Hand übernehmen:
• Planung & Design: Bestandsaufnahme, Bauordnungs-/Bebauungscheck, Varianten bis zur Einreichung – ein stimmiges, genehmigungsfähiges Konzept.
• Bau & Übergabe: Koordination aller Gewerke, Qualitätssicherung, termin- und kostentreu – schlüsselfertige Übergabe ohne Überraschungen.
• Finanzierung & Betreuung: klare Kostenstruktur, Zahlungsplan, Förderungen, Begleitung auch nach der Übergabe – Sicherheit und ein fester Ansprechpartner.

Unser Vorschlag: kurzes, kostenloses Erstgespräch (vor Ort oder online). Im Anschluss erhalten Sie eine kompakte Einschätzung mit Optionen, Budgetrahmen und nächsten Schritten.

Wenn das für Sie interessant klingt, teilen Sie uns bitte Ihre Wunschzeiten mit – wir richten uns nach Ihrem Kalender. Sie erreichen uns jederzeit per Mail oder telefonisch.

Mit besten Grüßen
Eldi Neziri
Projektberater Wohnbau
T +43 1 774 20 32
E info@wisehomes.at · wisehomes.at`;

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res
        .status(200)
        .json({ ok: true, usage: 'POST /api/letter { adresse, plzOrt, text? }' });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')
      return res.status(405).json({ error: 'Use POST with JSON body' });

    // Body robust parsen
    let b = req.body;
    if (typeof b === 'string') {
      try {
        b = JSON.parse(b);
      } catch {
        b = {};
      }
    }
    if (!b || typeof b !== 'object') b = {};

    const adresse = (b.adresse ?? b.address ?? b.Adresse ?? '').toString().trim();
    const plzOrt =
      (b['plz/ort'] ?? b['PLZ/Ort'] ?? b.plzOrt ?? b.plz_ort ?? b.plzort ?? '')
        .toString()
        .trim();

    const contentBody = (b.text ?? b.body ?? DEFAULT_TEXT).toString();

    // === PDF ===
    const pdf = await PDFDocument.create();
    const helv = await pdf.embedStandardFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedStandardFont(StandardFonts.HelveticaBold);

    // Seite 1
    const page = pdf.addPage([A4.width, A4.height]);

    // AcroForm & Default-Appearance (/DA) auf Helvetica
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
        const w = img.width * scale,
          h = img.height * scale;
        const x = A4.width - mm2pt(20) - w; // rechter Rand 20 mm
        const y = A4.height - mm2pt(15) - h; // oberer Rand 15 mm
        page.drawImage(img, { x, y, width: w, height: h });
      }
    } catch (e) {
      // Logo ist optional – Fehler ignorieren
    }

    // Fenster & Layout (linker Text-Rand = Fenster links → bündig)
    const winX = mm2pt(WINDOW_MM.left);
    const winW = mm2pt(WINDOW_MM.width);
    const winH = mm2pt(WINDOW_MM.height);
    const winY = A4.height - mm2pt(WINDOW_MM.top) - winH;

    const marginLeft = winX;
    const marginRight = mm2pt(20);
    const topMarginBelowWindow = mm2pt(22); // Luft unter dem Fenster
    const bottomMargin = mm2pt(18);
    const contentWidth = A4.width - marginLeft - marginRight;

    // Editierbares Feld (inkl. „An die neuen Eigentümer“)
    const addrField = form.createTextField('anschrift');
    addrField.enableMultiline();
    addrField.addToPage(page, {
      x: winX,
      y: winY,
      width: winW,
      height: winH,
      borderWidth: 0,
    });
    const editableBlock = [
      'An die neuen Eigentümer',
      adresse || 'Bahnstraße 17',
      plzOrt || '2404 Petronell',
    ].join('\n');
    addrField.setText(editableBlock);
    if (addrField.acroField && addrField.acroField.dict) {
      // Im Fenster etwas kleiner
      addrField.acroField.dict.set(
        PDFName.of('DA'),
        PDFString.of('/Helv 10 Tf 0 g')
      );
    }
    addrField.updateAppearances(helv);

    // ===== Textlayout mit Auto-Fit =====
    const wrap = (text, font, size, width) => {
      const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= width) line = t;
        else {
          if (line) lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    const drawSmart = (text, size, measureOnly = false) => {
      const lineGap = 3; // luftiger Abstand
      const lineStep = helv.heightAtSize(size) + lineGap;
      let y = A4.height - mm2pt(WINDOW_MM.top) - winH - topMarginBelowWindow;

      const paras = text.split('\n\n');

      const drawLine = (ln, font) => {
        const lines = wrap(ln, font, size, contentWidth);
        for (const l of lines) {
          if (y < bottomMargin) return false; // overflow
          if (!measureOnly)
            page.drawText(l, {
              x: marginLeft,
              y,
              size,
              font,
              color: rgb(0, 0, 0),
            });
          y -= lineStep;
        }
        return true;
      };

      for (let p of paras) {
        const lines = p.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!lines.length) {
          y -= lineStep;
          continue;
        }

        for (let ln of lines) {
          // Bullets
          if (ln.startsWith('•')) {
            const bulletIndent = mm2pt(6);
            const rest = ln.replace(/^•\s*/, '');
            const linesRest = wrap(rest, helv, size, contentWidth - bulletIndent);

            // erste Bullet-Zeile fett
            if (y < bottomMargin) return false;
            if (!measureOnly) {
              page.drawText('•', {
                x: marginLeft,
                y,
                size,
                font: helvBold,
              });
              page.drawText(linesRest[0] || '', {
                x: marginLeft + bulletIndent,
                y,
                size,
                font: helvBold,
              });
            }
            y -= lineStep;

            for (let i = 1; i < linesRest.length; i++) {
              if (y < bottomMargin) return false;
              if (!measureOnly)
                page.drawText(linesRest[i], {
                  x: marginLeft + bulletIndent,
                  y,
                  size,
                  font: helv,
                });
              y -= lineStep;
            }
            continue;
          }

          // fett gesetzte Einzeiler
          const isBold =
            ln === 'herzlichen Glückwunsch zum Auktionszuschlag.' ||
            ln.startsWith('Was wir für Sie aus einer Hand übernehmen:');

          if (!drawLine(ln, isBold ? helvBold : helv)) return false;
        }
        // Absatzabstand
        y -= 1.5;
      }
      return true;
    };

    // Auto-Fit: probiere 11 → 10.5 → 10 → 9.5 pt
    const sizes = [11, 10.5, 10, 9.5];
    let picked = sizes[sizes.length - 1];
    for (const s of sizes) {
      if (drawSmart(contentBody, s, true)) {
        picked = s;
        break;
      }
    }
    // jetzt wirklich zeichnen
    drawSmart(contentBody, picked, false);

    const bytes = await pdf.save();
    res.status(200).json({
      fileName: 'wisehomes_brief.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from(bytes).toString('base64'),
    });
  } catch (e) {
    res
      .status(500)
      .json({ error: 'Internal error', details: String(e?.message || e) });
  }
};
