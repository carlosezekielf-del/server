const nodemailer = require('nodemailer');

const MAIL_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 10000);

const withTimeout = (promise, ms, label) => {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
};

const getTransport = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    connectionTimeout: MAIL_TIMEOUT_MS,
    greetingTimeout: MAIL_TIMEOUT_MS,
    socketTimeout: MAIL_TIMEOUT_MS,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendWelcomeEmail = async (to, name) => {
  const tx = getTransport();
  if (!tx) return false;
  try {
    await withTimeout(tx.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'Welcome to Namiskii',
      text: `Hi ${name || 'there'}, welcome to Namiskii! Your account is ready.`,
      html: `<p>Hi <strong>${name || 'there'}</strong>, welcome to <strong>Namiskii</strong>! Your account is ready.</p>`
    }), MAIL_TIMEOUT_MS, 'SMTP send');
    return true;
  } catch {
    return false;
  }
};

const sendPasswordResetCode = async (to, name, code) => {
  const tx = getTransport();
  if (!tx) return false;
  try {
    await withTimeout(tx.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'Namiskii Password Reset Code',
      text: `Hi ${name || 'there'}, your Namiskii reset code is ${code}. It expires in 10 minutes.`,
      html: `<p>Hi <strong>${name || 'there'}</strong>, your Namiskii reset code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`
    }), MAIL_TIMEOUT_MS, 'SMTP send');
    return true;
  } catch {
    return false;
  }
};

module.exports = { sendWelcomeEmail, sendPasswordResetCode };
