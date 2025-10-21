const { Resend } = require("resend");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

/**
 * Beslisregels TO:
 * - Als query ?force_to=info  -> altijd TO=info@huisverkoopklaar.nl  (handig voor cURL tests)
 * - Anders: TO = body.email, maar met harde fallback naar info@huisverkoopklaar.nl
 *   (zo kan "Missing to" niet meer voorkomen)
 * - BCC is altijd j.de*

cat > api/send-pdf.js <<'EOF'
const { Resend } = require("resend");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

/**
 * Beslisregels TO:
 * - Als query ?force_to=info  -> altijd TO=info@huisverkoopklaar.nl  (handig voor cURL tests)
 * - Anders: TO = body.email, maar met harde fallback naar info@huisverkoopklaar.nl
 *   (zo kan "Missing to" niet meer voorkomen)
 * - BCC is altijd j.dekker@huisverkoopklaar.nl
 * - reply_to = gebruiker (contact.email of body.email), fallback info@
 */
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Body veilig parsen
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { email, subject, cta_url, contact, resultaat } = body;

    // Testschakelaar via query
    const forceToInfo = (req.query && (req.query.force_to === 'info' || req.query.forceTo === 'info'));

    // Definitieve ontvangers
    const TO  = forceToInfo ? "info@huisverkoopklaar.nl" : (email || "info@huisverkoopklaar.nl");
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

    // Debug in logs om zeker te weten wat er gebeurt
    console.log("send-pdf debug", {
      forceToInfo,
      payloadEmail: email,
      computedTo: TO,
      reply_to: REPLY_TO
    });

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

    return res.status(200).json({
      ok: true,
      id: data?.id || null,
      to: TO,
      reply_to: REPLY_TO,
      forced: !!forceToInfo
    });
  } catch (err) {
    console.error("send-pdf error:", err);
    return res.status(500).json({
      error: "Onverwachte serverfout",
      details: err?.message || String(err),
    });
  }
};
