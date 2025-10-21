const { Resend } = require("resend");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Testschakelaar + debug via query
  const q = req.query || {};
  const forceToInfo = q.force_to === "info" || q.forceTo === "info";
  const debugMode   = q.debug === "1" || q.debug === "true";

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Body veilig parsen
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { email, subject, cta_url, contact, resultaat } = body;

    // TO-logica (nooit meer "Missing to")
    const TO  = forceToInfo ? "info@huisverkoopklaar.nl" : (email || "info@huisverkoopklaar.nl");
    const BCC = "j.dekker@huisverkoopklaar.nl";
    const REPLY_TO = (contact && contact.email) || email || "info@huisverkoopklaar.nl";

    // FROM moet een bij Resend geverifieerde afzender zijn.
    // Zet deze in Vercel: RESEND_FROM=info@huisverkoopklaar.nl (na domain/sender verification)
    // Tijdelijke fallback om te testen: onboarding@resend.dev
    const FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

    // --- PDF generatie (ASCII-safe) ---
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const safe = (t) => String(t || "").replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, " ").trim();

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

    console.log("send-pdf debug", { computedTo: TO, reply_to: REPLY_TO, from: FROM, forceToInfo, hasKey: !!process.env.RESEND_API_KEY });

    const data = await resend.emails.send({
      from: FROM,
      to: TO,
      bcc: BCC,
      reply_to: REPLY_TO,
      subject: subject || "Waarderapport",
      text: "In de bijlage vind je het PDF-waarderapport.",
      attachments: [{ filename: "waarderapport.pdf", content: Buffer.from(pdfBytes).toString("base64") }],
    });

    return res.status(200).json({ ok: true, id: data?.id || null, to: TO, from: FROM, forced: !!forceToInfo });
  } catch (err) {
    console.error("send-pdf error:", err);
    const payload = { error: "Onverwachte serverfout" };
    // In test/debug modus geven we de *echte* fout terug (handig tijdens debuggen)
    if (forceToInfo || debugMode) payload.details = err?.message || String(err);
    return res.status(500).json(payload);
  }
};
