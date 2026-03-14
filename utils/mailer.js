const nodemailer = require('nodemailer');

const getTransport = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendWelcomeEmail = async (to, name) => {
  const tx = getTransport();
  if (!tx) return false;
  await tx.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Welcome to Namiskii',
    text: `Hi ${name || 'there'}, welcome to Namiskii! Your account is ready.`,
    html: `<p>Hi <strong>${name || 'there'}</strong>, welcome to <strong>Namiskii</strong>! Your account is ready.</p>`
  });
  return true;
};

const sendPasswordResetCode = async (to, name, code) => {
  const tx = getTransport();
  if (!tx) return false;
  await tx.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Namiskii Password Reset Code',
    text: `Hi ${name || 'there'}, your Namiskii reset code is ${code}. It expires in 10 minutes.`,
    html: `<p>Hi <strong>${name || 'there'}</strong>, your Namiskii reset code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`
  });
  return true;
};

module.exports = { sendWelcomeEmail, sendPasswordResetCode };
