import { Resend } from "resend";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { email, subject, cta_url, contact, resultaat } = req.body;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const safeText = (t) =>
      String(t || "")
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const lines = [
      `Huisverkoopklaar - Waarderapport`,
      `Naam: ${safeText(contact?.naam)}`,
      `E-mail: ${safeText(contact?.email)}`,
      `Geschatte waarde: €${safeText(resultaat?.waarde_min)} - €${safeText(resultaat?.waarde_max)}`,
      `Afspraaklink: ${cta_url}`,
    ];

    let y = height - 50;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
      y -= 20;
    }

    const pdfBytes = await pdfDoc.save();

    const data = await resend.emails.send({
      from: "info@huisverkoopklaar.nl",
      to: email,
      bcc: "j.dekker@huisverkoopklaar.nl",
      subject: subject || "Jouw woningwaarde",
      text: "Hierbij jouw woningwaarde PDF.",
      attachments: [
        {
          filename: "woningwaarde.pdf",
          content: Buffer.from(pdfBytes).toString("base64"),
        },
      ],
    });

    return res.status(200).json({ ok: true, id: data.id, to: email });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      error: "Onverwachte serverfout",
      details: err.message || String(err),
    });
  }
}
