// /api/letter.js — Vercel Serverless Function (Node 20)
// POST JSON: { "adresse": "Bahnstraße 17", "plzOrt": "2404 Petronell", "text": "optional override" }

const {
  PDFDocument,
  StandardFonts,
  PDFName,
  PDFString,
  PDFBool,
} = require('pdf-lib');

const mm2pt = (mm) => mm * 2.834645669;
const A4 = { width: 595.28, height: 841.89 };

// Fensterposition (DL/C6/5)
const WINDOW_MM = { left: 20, top: 45, width: 90, height: 45 };

// Spacing & Typografie (hier anpassen)
const SPACING = {
  lineGap: 5,                 // zusätzlicher Zeilenabstand (pt)
  paragraphGap: 10,           // Abstand zwischen Absätzen (pt)
  bulletGap: 6,               // Abstand nach Bullet-Block (pt)
  bulletIndentMM: 6,          // Einzug hinter "•" (mm)
  topBelowWindowMM: 28,       // Luft unter Adressfenster bis Text (mm)
  bottomMarginMM: 22,         // unterer Rand (mm)

  // Feste Schriftgröße für Fließtext UND Adressfeld (exakt gleich)
  baseFontSize: 11,           // z.B. 10.5 | 11 | 11.25

  // Start den Text N Zeilen "höher" (näher ans Fenster)
  startUpLines: 2,            // 0 = Standard; 2 = zwei Zeilen höher starten

  signatureGapMM: 12,         // Unterschriftsfläche vor "Eldi Neziri" (mm)
  headingBeforeGapPt: 14,     // kleiner Abstand VOR "Was wir …"
  headingAfterGapPt: 6,       // kleiner Abstand NACH "Was wir …"
};

// Logo (optional)
const LOGO_URL = 'https://wisehomes.at/wp-content/uploads/2025/05/wisehomes-color@0.5x.png';
const LOGO_WIDTH_PT = 110; // ~39 mm

// Standardtext (kann per "text" überschrieben werden)
const DEFAULT_TEXT = `Sehr geehrte Damen und Herren,

herzlichen Glückwunsch zum Auktionszuschlag.

Wir sind Wisehomes, Generalunternehmer und Bauträger aus Wien mit Fokus auf Ziegel-Massivbau von Einfamilien- und Doppelhäusern in Wien, Niederösterreich und Burgenland. Wir sichten laufend potenzielle Projekte auf öffentlichen Auktions- und Amtsportalen, diese Liegenschaft ist uns dabei besonders aufgefallen. Da sie fachlich sehr gut zu unserem Profil passt, melden wir uns direkt bei Ihnen, in der Überzeugung, dass hier gute Voraussetzungen für eine Zusammenarbeit bestehen.
Was wir für Sie aus einer Hand übernehmen:
• Planung & Design: Bestandsaufnahme, Bauordnungs-/Bebauungscheck, Varianten bis zur Einreichung – ein stimmiges, genehmigungsfähiges Konzept.
• Bau & Übergabe: Koordination aller Gewerke, Qualitätssicherung, termin- und kostentreu – schlüsselfertige Übergabe ohne Überraschungen.
• Finanzierung & Betreuung: klare Kostenstruktur, Zahlungsplan, Förderungen, Begleitung auch nach der Übergabe – Sicherheit und ein fester Ansprechpartner.

Unser Angebot: ein kostenloses Erstgespräch (vor Ort oder online). Anschließend erhalten Sie eine kurze Einschätzung mit Optionen, Budgetrahmen und nächsten Schritten.

Wenn das für Sie interessant klingt, nennen Sie uns einfach 2–3 Wunschtermine, wir richten uns nach Ihrem Kalender. Sie erreichen uns jederzeit per E-Mail info@wisehomes.at oder telefonisch +43 1 774 20 32.

Mit besten Grüßen
Eldi Neziri
Projektberater | Wohnbau
T +43 1 774 20 32 · E eldi.neziri@wisehomes.at · wisehomes.at`;

module.exports = async (req, res) => {
  try {
    // Healthcheck
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, usage: 'POST /api/letter { adresse, plzOrt, text? }' });
    }

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with JSON body' });

    // Body parsen
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    if (!b || typeof b !== 'object') b = {};
    const adresse = (b.adresse ?? b.address ?? b.Adresse ?? '').toString().trim();
    const plzOrt  = (b['plz/ort'] ?? b['PLZ/Ort'] ?? b.plzOrt ?? b.plz_ort ?? b.plzort ?? '').toString().trim();
    const contentBody = (b.text ?? b.body ?? DEFAULT_TEXT).toString();

    // PDF init
    const pdf = await PDFDocument.create();
    const helv = await pdf.embedStandardFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedStandardFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([A4.width, A4.height]);

    // AcroForm: Ressourcen setzen, einheitliches /DA, NeedAppearances = false
    const form = pdf.getForm();
    const acro = form.acroForm;
    if (acro) {
      const dr = pdf.context.obj({});
      const fonts = pdf.context.obj({});
      fonts.set(PDFName.of('Helv'), helv.ref);
      dr.set(PDFName.of('Font'), fonts);
      acro.dict.set(PDFName.of('DR'), dr);
      acro.dict.set(PDFName.of('DA'), PDFString.of(`/Helv ${SPACING.baseFontSize} Tf 0 g`));
      acro.dict.set(PDFName.of('NeedAppearances'), PDFBool.False);
    }

    // Logo oben rechts (optional)
    try {
      const r = await fetch(LOGO_URL);
      if (r.ok) {
        const arr = new Uint8Array(await r.arrayBuffer());
        const img = await pdf.embedPng(arr);
        const scale = LOGO_WIDTH_PT / img.width;
        const w = img.width * scale, h = img.height * scale;
        const x = A4.width - mm2pt(20) - w;     // rechter Rand 20 mm
        const y = A4.height - mm2pt(16) - h;    // oberer Rand 16 mm
        page.drawImage(img, { x, y, width: w, height: h });
      }
    } catch {}

    // Layout-Grundwerte
    const winX = mm2pt(WINDOW_MM.left);
    const winW = mm2pt(WINDOW_MM.width);
    const winH = mm2pt(WINDOW_MM.height);
    const winY = A4.height - mm2pt(WINDOW_MM.top) - winH;

    const marginLeft = winX;
    const marginRight = mm2pt(22);
    const contentWidth = A4.width - marginLeft - marginRight;

    // Editierbares Adressfeld – zwei Leerzeilen OBEN, dann Eigentümer, Straße, PLZ/Ort
    const addrField = form.createTextField('anschrift');
    addrField.enableMultiline();
    addrField.addToPage(page, { x: winX, y: winY, width: winW, height: winH, borderWidth: 0 });
    addrField.setText([
      '', '',                                  // zwei Leerzeilen oben
      'An die neuen Eigentümer',
      (adresse || 'Bahnstraße 17'),
      (plzOrt  || '2404 Petronell')
    ].join('\n'));
    // Feld-DA, Font & Größe auf exakt denselben Wert wie der Fließtext
    if (addrField?.acroField?.dict) {
      addrField.acroField.dict.set(PDFName.of('DA'), PDFString.of(`/Helv ${SPACING.baseFontSize} Tf 0 g`));
      if (addrField.setFont) try { addrField.setFont(helv); } catch {}
      if (addrField.setFontSize) try { addrField.setFontSize(SPACING.baseFontSize); } catch {}
    }

    // Textwrapping
    const wrap = (text, font, size, width) => {
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

    // Text zeichnen (feste Größe)
    function drawSmart(size) {
      const bulletIndent = mm2pt(SPACING.bulletIndentMM);
      const lineStep = helv.heightAtSize(size) + SPACING.lineGap;
      const bottomMargin = mm2pt(SPACING.bottomMarginMM);

      let y =
        A4.height
        - mm2pt(WINDOW_MM.top)
        - winH
        - mm2pt(SPACING.topBelowWindowMM)
        + SPACING.startUpLines * lineStep;

      const drawWrapped = (ln, font = helv) => {
        const lines = wrap(ln, font, size, contentWidth);
        for (const l of lines) {
          if (y < bottomMargin) return false;
          page.drawText(l, { x: marginLeft, y, size, font });
          y -= lineStep;
        }
        return true;
      };

      const paragraphs = contentBody.split('\n\n');
      for (const para of paragraphs) {
        const lines = para.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length) { y -= lineStep; continue; }

        for (const ln of lines) {
          const isHeading = ln.startsWith('Was wir für Sie aus einer Hand übernehmen:');
          if (isHeading) { y -= SPACING.headingBeforeGapPt; }

          // Bullets: nur der Titel bis ":" fett, Rest normal
          if (ln.startsWith('• ')) {
            const rest = ln.replace(/^•\s*/, '');
            const m = rest.match(/^([^:]+:\s*)(.*)$/);
            const title = m ? m[1] : rest; // inkl. ": "
            const body  = m ? m[2] : '';

            // Bullet-Punkt
            page.drawText('•', { x: marginLeft, y, size, font: helvBold });

            // Titel fett
            const xText = marginLeft + bulletIndent;
            page.drawText(title, { x: xText, y, size, font: helvBold });

            // Verbleibende Breite in der ersten Zeile für den Body
            const titleWidth = helvBold.widthOfTextAtSize(title, size);
            const firstLineX = xText + titleWidth;
            const firstLineW = Math.max(0, contentWidth - bulletIndent - titleWidth);

            // Body – erster Zeilenrest passt noch in die erste Zeile
            const words = body.trim() ? body.trim().split(/\s+/) : [];
            let firstBody = '';
            while (
              words.length &&
              helv.widthOfTextAtSize(firstBody ? firstBody + ' ' + words[0] : words[0], size) <= firstLineW
            ) {
              firstBody = firstBody ? firstBody + ' ' + words.shift() : words.shift();
            }
            if (firstBody) {
              page.drawText(firstBody, { x: firstLineX, y, size, font: helv });
            }
            y -= lineStep;

            // Weitere Zeilen des Bodys normal umbrechen
            const remaining = words.join(' ');
            const wrappedRest = wrap(remaining, helv, size, contentWidth - bulletIndent);
            for (const l of wrappedRest) {
              page.drawText(l, { x: marginLeft + bulletIndent, y, size, font: helv });
              y -= lineStep;
            }

            y -= SPACING.bulletGap;
            continue;
          }

          if (ln === 'Eldi Neziri') {
            y -= mm2pt(SPACING.signatureGapMM); // Unterschriftsfläche
          }

          // Nur die Überschrift fett – NICHT die Glückwunsch-Zeile
          const isBold = isHeading;
          if (!drawWrapped(ln, isBold ? helvBold : helv)) break;

          if (isHeading) { y -= SPACING.headingAfterGapPt; }
        }
        y -= SPACING.paragraphGap;
      }
    }

    // Brief setzen
    drawSmart(SPACING.baseFontSize);

    // Feld-Appearance final erzeugen
    addrField.updateAppearances(helv);

    // Antwort
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
