const { Resend } = require('resend');

const MAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || 10000);
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || '';
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || process.env.EMAIL_FROM_NAME || '';

const hasResend = Boolean(RESEND_API_KEY && (RESEND_FROM || RESEND_FROM_EMAIL));
const resend = hasResend ? new Resend(RESEND_API_KEY) : null;

const buildFrom = () => {
  if (RESEND_FROM) return RESEND_FROM;
  if (!RESEND_FROM_EMAIL) return '';
  if (!RESEND_FROM_NAME) return RESEND_FROM_EMAIL;
  return `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;
};

const withTimeout = (promise, ms, label) => {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
};

const sendViaResend = async ({ to, subject, text, html }) => {
  if (!resend) return false;
  const from = buildFrom();
  if (!from) return false;
  try {
    const result = await withTimeout(resend.emails.send({
      from,
      to,
      subject,
      text,
      html
    }), MAIL_TIMEOUT_MS, 'Resend send');
    if (result?.error) return false;
    return true;
  } catch {
    return false;
  }
};

const sendEmail = async (payload) => {
  if (hasResend) return sendViaResend(payload);
  return false;
};

const sendWelcomeEmail = async (to, name) => {
  try {
    return await sendEmail({
      to,
      subject: 'Welcome to Namiskii',
      text: `Hi ${name || 'there'}, welcome to Namiskii! Your account is ready.`,
      html: `<p>Hi <strong>${name || 'there'}</strong>, welcome to <strong>Namiskii</strong>! Your account is ready.</p>`
    });
  } catch {
    return false;
  }
};

const sendPasswordResetCode = async (to, name, code) => {
  try {
    return await sendEmail({
      to,
      subject: 'Namiskii Password Reset Code',
      text: `Hi ${name || 'there'}, your Namiskii reset code is ${code}. It expires in 10 minutes.`,
      html: `<p>Hi <strong>${name || 'there'}</strong>, your Namiskii reset code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`
    });
  } catch {
    return false;
  }
};

const isEmailReady = () => hasResend;

const getEmailDiagnostics = async () => ({
  resend: {
    ready: hasResend,
    from: buildFrom()
  },
  timeoutMs: MAIL_TIMEOUT_MS
});

module.exports = { sendWelcomeEmail, sendPasswordResetCode, isEmailReady, getEmailDiagnostics };
