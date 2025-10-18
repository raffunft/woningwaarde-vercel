module.exports = (req, res) => {
  res.status(200).json({ ok: true, service: 'woningwaarde-vercel', ts: Date.now() });
};
