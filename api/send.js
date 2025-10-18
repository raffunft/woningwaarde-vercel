/**
 * POST /api/send
 * Body (JSON):
 *  { to: "naam@domein.nl", subject?: "…", html?: "<p>…</p>", text?: "…",
 *    bcc?: ["mail@domein.nl"], attachments?: [{ name: "rapport.pdf", content: "<base64>" }] }
 *
 * Vereist ENV vars (Vercel → Settings → Environment Variables):
 *  - BREVO_API_KEY
 *  - FROM_EMAIL   (bijv. no-reply@huisverkoopklaar.nl)
 *  - BCC_EMAIL    (optioneel; wordt standaard toegevoegd als bcc)
 */
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    }
    body ||= {};

    const { to, subject = 'Woningwaarde rapport', html, text, bcc = [], attachments = [] } = body;
    if (!to) return res.status(400).json({ error: 'Missing "to"' });

    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const FROM_EMAIL    = process.env.FROM_EMAIL || 'no-reply@huisverkoopklaar.nl';
    const DEFAULT_BCC   = process.env.BCC_EMAIL;

    if (!BREVO_API_KEY) return res.status(500).json({ error: 'Missing BREVO_API_KEY env' });

    // combineer bcc uit body met default bcc
    const allBcc = [...(Array.isArray(bcc) ? bcc : []), ...(DEFAULT_BCC ? [DEFAULT_BCC] : [])]
      .filter(Boolean)
      .map(e => ({ email: e }));

    // Brevo payload
    const payload = {
      sender: { email: FROM_EMAIL, name: 'Huisverkoopklaar' },
      to: [{ email: to }],
      bcc: allBcc.length ? allBcc : undefined,
      subject,
      htmlContent: html || '<p>Uw woningwaarde-rapport is gereed.</p>',
      textContent: text,
      attachment: attachments // [{ name, content(base64) }]
    };

    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'accept': 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: data });

    // CORS (handig als je direct vanuit frontend callt)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    return res.status(200).json({ ok: true, brevo: data });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
