const { Resend } = require('resend');

const MAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || 10000);
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || '';
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || process.env.EMAIL_FROM_NAME || '';

const PUBLIC_MAILBOX_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com'
]);

const hasResend = Boolean(RESEND_API_KEY && (RESEND_FROM || RESEND_FROM_EMAIL));
const resend = hasResend ? new Resend(RESEND_API_KEY) : null;

const buildFrom = () => {
  if (RESEND_FROM) return RESEND_FROM;
  if (!RESEND_FROM_EMAIL) return '';
  if (!RESEND_FROM_NAME) return RESEND_FROM_EMAIL;
  return `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;
};

const extractAddress = (value) => {
  const source = String(value || '').trim();
  if (!source) return '';
  const bracketMatch = source.match(/<([^>]+)>/);
  if (bracketMatch) return bracketMatch[1].trim().toLowerCase();
  const directMatch = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return directMatch ? directMatch[0].trim().toLowerCase() : '';
};

const getSenderInfo = () => {
  const from = buildFrom();
  const senderEmail = extractAddress(from);
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@').pop() : '';
  return {
    from,
    senderEmail,
    senderDomain
  };
};

const getEmailSetupIssue = () => {
  if (!RESEND_API_KEY) return 'Missing RESEND_API_KEY.';

  const { from, senderEmail, senderDomain } = getSenderInfo();
  if (!from || !senderEmail) {
    return 'Missing RESEND_FROM or RESEND_FROM_EMAIL.';
  }
  if (PUBLIC_MAILBOX_DOMAINS.has(senderDomain)) {
    return `Resend cannot send from ${senderDomain}. Verify your own domain in Resend and use RESEND_FROM like Namishkii Support <noreply@send.yourdomain.com>.`;
  }
  return '';
};

const withTimeout = (promise, ms, label) => {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
};

const normalizeResendError = (error) => {
  const rawMessage = String(error?.message || '').trim();
  if (!rawMessage) return 'Email send failed.';

  const { senderDomain } = getSenderInfo();
  if (/domain is not verified/i.test(rawMessage) && senderDomain) {
    return `Resend rejected the sender because ${senderDomain} is not verified. Verify that domain in Resend and keep RESEND_FROM on the same domain.`;
  }
  if (/only send testing emails to your own email address/i.test(rawMessage) || /resend\.dev/i.test(rawMessage)) {
    return 'Resend test senders only work for your own inbox. Verify a domain in Resend before sending password reset emails to customers.';
  }
  return rawMessage;
};

const sendViaResend = async ({ to, subject, text, html }) => {
  if (!resend) {
    return { ok: false, error: getEmailSetupIssue() || 'Resend is not configured.' };
  }
  const from = buildFrom();
  const setupIssue = getEmailSetupIssue();
  if (!from || setupIssue) {
    return { ok: false, error: setupIssue || 'Missing email sender configuration.' };
  }
  try {
    const result = await withTimeout(resend.emails.send({
      from,
      to,
      subject,
      text,
      html
    }), MAIL_TIMEOUT_MS, 'Resend send');
    if (result?.error) {
      return { ok: false, error: normalizeResendError(result.error) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: normalizeResendError(error) };
  }
};

const sendEmail = async (payload) => {
  if (hasResend) return sendViaResend(payload);
  return { ok: false, error: getEmailSetupIssue() || 'Resend is not configured.' };
};

const sendWelcomeEmailDetailed = async (to, name) => {
  return sendEmail({
    to,
    subject: 'Welcome to Namiskii',
    text: `Hi ${name || 'there'}, welcome to Namiskii! Your account is ready.`,
    html: `<p>Hi <strong>${name || 'there'}</strong>, welcome to <strong>Namiskii</strong>! Your account is ready.</p>`
  });
};

const sendWelcomeEmail = async (to, name) => {
  try {
    const result = await sendWelcomeEmailDetailed(to, name);
    return result.ok;
  } catch {
    return false;
  }
};

const sendPasswordResetCodeDetailed = async (to, name, code) => {
  return sendEmail({
    to,
    subject: 'Namiskii Password Reset Code',
    text: `Hi ${name || 'there'}, your Namiskii reset code is ${code}. It expires in 10 minutes.`,
    html: `<p>Hi <strong>${name || 'there'}</strong>, your Namiskii reset code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`
  });
};

const sendPasswordResetCode = async (to, name, code) => {
  try {
    const result = await sendPasswordResetCodeDetailed(to, name, code);
    return result.ok;
  } catch {
    return false;
  }
};

const isEmailReady = () => !getEmailSetupIssue();

const getEmailDiagnostics = () => {
  const sender = getSenderInfo();
  const setupIssue = getEmailSetupIssue();
  return {
    resend: {
      ready: !setupIssue,
      configured: hasResend,
      from: sender.from,
      senderEmail: sender.senderEmail,
      senderDomain: sender.senderDomain,
      setupIssue: setupIssue || null
    },
    timeoutMs: MAIL_TIMEOUT_MS
  };
};

module.exports = {
  sendWelcomeEmail,
  sendWelcomeEmailDetailed,
  sendPasswordResetCode,
  sendPasswordResetCodeDetailed,
  isEmailReady,
  getEmailDiagnostics
};
