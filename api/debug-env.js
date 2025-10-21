module.exports = (req, res) => {
  res.status(200).json({
    hasResend: Boolean(process.env.RESEND_API_KEY),
    nodeEnv: process.env.NODE_ENV || null,
  });
};
