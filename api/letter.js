// /api/letter.js — Vercel Serverless Function (Node 20)
const {
  PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFBool
} = require('pdf-lib');

const mm2pt = (mm) => mm * 2.834645669;
const A4 = { width: 595.28, height: 841.89 };

const WINDOW_MM = { left: 20, top: 45, width: 90, height: 45 };

const SPACING = {
  lineGap: 5, paragraphGap: 10, bulletGap: 6, bulletIndentMM: 6,
  topBelowWindowMM: 28, bottomMarginMM: 24,
  sizeCandidates: [11.25, 11, 10.75, 10.5, 10.25, 10, 9.75, 9.5],
  signatureGapMM: 18, headingBeforeGapPt: 6, headingAfterGapPt: 6,
};

const LOGO_URL = 'https://wisehomes.at/wp-content/uploads/2025/05/wisehomes-color@0.5x.png';
const LOGO_WIDTH_PT = 110;

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
    const contentBody = (b.text ?? b.body ?? DEFAULT_TEXT).toString();

    const pdf = await PDFDocument.create();
    const helv = await pdf.embedStandardFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedStandardFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([A4.width, A4.height]);

    const form = pdf.getForm();
    const acro = form.acroForm;
    if (acro) {
      const dr = pdf.context.obj({});
      const fonts = pdf.context.obj({});
      fonts.set(PDFName.of('Helv'), helv.ref);
      dr.set(PDFName.of('Font'), fonts);
      acro.dict.set(PDFName.of('DR'), dr);
      acro.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
    }

    // Logo
    try {
      const r = await fetch(LOGO_URL);
      if (r.ok) {
        const arr = new Uint8Array(await r.arrayBuffer());
        const img = await pdf.embedPng(arr);
        const scale = LOGO_WIDTH_PT / img.width;
        const w = img.width * scale, h = img.height * scale;
        const x = A4.width - mm2pt(20) - w, y = A4.height - mm2pt(16) - h;
        page.drawImage(img, { x, y, width: w, height: h });
      }
    } catch {}

    // Fenster / Layout
    const winX = mm2pt(WINDOW_MM.left), winW = mm2pt(WINDOW_MM.width);
    const winH = mm2pt(WINDOW_MM.height);
    const winY = A4.height - mm2pt(WINDOW_MM.top) - winH;

    const marginLeft = winX, marginRight = mm2pt(22);
    const contentWidth = A4.width - marginLeft - marginRight;

    // Adressfeld (noch KEIN updateAppearances hier!)
    const addrField = form.createTextField('anschrift');
    addrField.enableMultiline();
    addrField.addToPage(page, { x: winX, y: winY, width: winW, height: winH, borderWidth: 0 });
    addrField.setText([
      '', '',                      // zwei Leerzeilen oben
      'An die neuen Eigentümer',
      (adresse || 'Bahnstraße 17'),
      (plzOrt  || '2404 Petronell')
    ].join('\n'));

    // Textlayout
    const wrap = (text, font, size, width) => {
      const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ');
      const lines = []; let line = '';
      for (const w of words) { const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= width) line = t;
        else { if (line) lines.push(line); line = w; } }
      if (line) lines.push(line); return lines;
    };

    function drawSmart(size, measureOnly = false) {
      const bulletIndent = mm2pt(SPACING.bulletIndentMM);
      const lineStep = helv.heightAtSize(size) + SPACING.lineGap;
      const bottomMargin = mm2pt(SPACING.bottomMarginMM);
      let y = A4.height - mm2pt(WINDOW_MM.top) - winH - mm2pt(SPACING.topBelowWindowMM);

      const drawWrapped = (ln, font = helv) => {
        const lines = wrap(ln, font, size, contentWidth);
        for (const l of lines) {
          if (y < bottomMargin) return false;
          if (!measureOnly) page.drawText(l, { x: marginLeft, y, size, font });
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
          if (isHeading) { if (y - SPACING.headingBeforeGapPt < bottomMargin) return false; y -= SPACING.headingBeforeGapPt; }

          if (ln.startsWith('• ')) {
            const rest = ln.replace(/^•\s*/, '');
            const wrapped = wrap(rest, helv, size, contentWidth - bulletIndent);
            if (y < bottomMargin) return false;
            if (!measureOnly) {
              page.drawText('•', { x: marginLeft, y, size, font: helvBold });
              page.drawText(wrapped[0] || '', { x: marginLeft + bulletIndent, y, size, font: helvBold });
            }
            y -= lineStep;
            for (let i = 1; i < wrapped.length; i++) {
              if (y < bottomMargin) return false;
              if (!measureOnly) page.drawText(wrapped[i], { x: marginLeft + bulletIndent, y, size, font: helv });
              y -= lineStep;
            }
            y -= SPACING.bulletGap;
            continue;
          }

          if (ln === 'Eldi Neziri') y -= mm2pt(SPACING.signatureGapMM);

          const isBold = ln === 'herzlichen Glückwunsch zum Auktionszuschlag.' || isHeading;
          if (!drawWrapped(ln, isBold ? helvBold : helv)) return false;

          if (isHeading) y -= SPACING.headingAfterGapPt;
        }
        y -= SPACING.paragraphGap;
      }
      return true;
    }

    // Auto-Fit
    let picked = SPACING.sizeCandidates[SPACING.sizeCandidates.length - 1];
    for (const s of SPACING.sizeCandidates) { if (drawSmart(s, true)) { picked = s; break; } }

    // ► EXAKTE ANGLEICHUNG: Formular & Feld auf picked setzen, dann Appearances rendern
    if (acro) acro.dict.set(PDFName.of('DA'), PDFString.of(`/Helv ${picked} Tf 0 g`));
    if (addrField?.acroField?.dict) {
      addrField.acroField.dict.set(PDFName.of('DA'), PDFString.of(`/Helv ${picked} Tf 0 g`));
      // Falls Viewer die Feldgröße aus der Appearance nimmt:
      if (addrField.setFontSize) try { addrField.setFontSize(picked); } catch {}
      if (addrField.setFont) try { addrField.setFont(helv); } catch {}
      addrField.updateAppearances(helv);
    }

    // Jetzt finalen Text zeichnen
    drawSmart(picked, false);

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
