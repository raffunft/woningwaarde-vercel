const { Resend } = require("resend");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

/**
 * Beslisregels TO:
 * - Test (bypass header aanwezig)  -> TO = info@huisverkoopklaar.nl
 * - Anders (normale productie)     -> TO = body.email (verplicht)
 *   (Als body.email toch ontbreekt, val alsnog terug op info@ om "Missing to" te voorkomen)
 */
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { email, subject, cta_url, contact, resultaat } = body;

    // Testmodus: als je via curl de Vercel-bypass header meestuurt, sturen we naar info@
    const bypassHeader = req.headers["x-vercel-protection-bypass"];
    const isTest = Boolean(bypassHeader);

    const TO = isTest ? "info@huisverkoopklaar.nl" : (email || "info@huisverkoopklaar.nl");
    const BCC = "j.dekker@huisverkoopklaar.nl";
    const REPLY_TO = (contact && contact.email) || email || "info@huisverkoopklaar.nl";

    // --- PDF generatie (ASCII-safe) ---
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const safe = (t) =>
      String(t || "")
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const lines = [
      `Huisverkoopklaar - Waarderapport`,
      `Naam: ${safe(contact?.naam)}`,
      `E-mail: ${safe(contact?.email)}`,
      `Geschatte waarde: €${safe(resultaat?.waarde_min)} - €${safe(resultaat?.waarde_max)}`,
      `Afspraaklink: ${safe(cta_url)}`
    ];

    let y = height - 50;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
      y -= 20;
    }

    const pdfBytes = await pdfDoc.save();

    // --- Versturen via Resend ---
    const data = await resend.emails.send({
      from: "info@huisverkoopklaar.nl",
      to: TO,
      bcc: BCC,
      reply_to: REPLY_TO,
      subject: subject || "Waarderapport",
      text: "In de bijlage vind je het PDF-waarderapport.",
      attachments: [
        {
          filename: "waarderapport.pdf",
          content: Buffer.from(pdfBytes).toString("base64"),
        },
      ],
    });

    return res.status(200).json({ ok: true, id: data?.id || null, to: TO, test: isTest });
  } catch (err) {
    console.error("send-pdf error:", err);
    return res.status(500).json({
      error: "Onverwachte serverfout",
      details: err?.message || String(err),
    });
  }
};
