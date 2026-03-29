const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const MAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || process.env.SMTP_TIMEOUT_MS || 10000);
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

const trim = (value) => String(value || '').trim();
const hasValue = (value) => Boolean(trim(value));
const extractAddress = (value) => {
  const source = trim(value);
  if (!source) return '';
  const bracketMatch = source.match(/<([^>]+)>/);
  if (bracketMatch) return bracketMatch[1].trim().toLowerCase();
  const directMatch = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return directMatch ? directMatch[0].trim().toLowerCase() : '';
};

const SMTP_HOST = trim(process.env.SMTP_HOST || process.env.EMAIL_HOST);
const SMTP_PORT_RAW = trim(process.env.SMTP_PORT || process.env.EMAIL_PORT);
const SMTP_SECURE_RAW = trim(process.env.SMTP_SECURE || process.env.EMAIL_SECURE);
const SMTP_USER = trim(process.env.SMTP_USER || process.env.EMAIL_USER);
const SMTP_PASS = trim(process.env.SMTP_PASS || process.env.EMAIL_PASS);
const SMTP_FROM = trim(process.env.SMTP_FROM || process.env.EMAIL_FROM);
const SMTP_FROM_NAME = trim(process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME);
const hasAnySmtpInput = [
  SMTP_HOST,
  SMTP_PORT_RAW,
  SMTP_SECURE_RAW,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  SMTP_FROM_NAME
].some(hasValue);

const RESEND_API_KEY = trim(process.env.RESEND_API_KEY);
const RESEND_FROM = trim(process.env.RESEND_FROM);
const RESEND_FROM_EMAIL = trim(process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM);
const RESEND_FROM_NAME = trim(process.env.RESEND_FROM_NAME || process.env.EMAIL_FROM_NAME);
const hasAnyResendInput = [
  RESEND_API_KEY,
  RESEND_FROM,
  RESEND_FROM_EMAIL,
  RESEND_FROM_NAME
].some(hasValue);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const inferSmtpHost = () => {
  const user = SMTP_USER.toLowerCase();
  if (!user) return '';
  if (user.endsWith('@gmail.com') || user.endsWith('@googlemail.com')) {
    return 'smtp.gmail.com';
  }
  return '';
};

const getSmtpHost = () => SMTP_HOST || inferSmtpHost();
const getSmtpPort = () => {
  if (SMTP_PORT_RAW) {
    const port = Number(SMTP_PORT_RAW);
    return Number.isFinite(port) ? port : 0;
  }
  return getSmtpHost() === 'smtp.gmail.com' ? 465 : 587;
};
const getSmtpSecure = () => {
  if (SMTP_SECURE_RAW) return SMTP_SECURE_RAW.toLowerCase() === 'true';
  return getSmtpPort() === 465;
};
const buildSmtpFrom = () => {
  const email = SMTP_FROM || SMTP_USER;
  if (!email) return '';
  if (!SMTP_FROM_NAME) return email;
  return `${SMTP_FROM_NAME} <${email}>`;
};
const getSmtpSetupIssue = () => {
  if (!hasAnySmtpInput) return '';
  if (!SMTP_USER) return 'Missing SMTP_USER or EMAIL_USER.';
  if (!SMTP_PASS) return 'Missing SMTP_PASS or EMAIL_PASS. For Gmail, use an App Password.';
  if (!getSmtpHost()) return 'Missing SMTP_HOST or EMAIL_HOST. For Gmail, use smtp.gmail.com.';
  return '';
};
const isSmtpReady = () => hasAnySmtpInput && !getSmtpSetupIssue();

const buildResendFrom = () => {
  if (RESEND_FROM) return RESEND_FROM;
  if (!RESEND_FROM_EMAIL) return '';
  if (!RESEND_FROM_NAME) return RESEND_FROM_EMAIL;
  return `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;
};
const getResendSenderInfo = () => {
  const from = buildResendFrom();
  const senderEmail = extractAddress(from);
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@').pop() : '';
  return {
    from,
    senderEmail,
    senderDomain
  };
};
const getResendSetupIssue = () => {
  if (!hasAnyResendInput) return '';
  if (!RESEND_API_KEY) return 'Missing RESEND_API_KEY.';

  const { from, senderEmail, senderDomain } = getResendSenderInfo();
  if (!from || !senderEmail) {
    return 'Missing RESEND_FROM or RESEND_FROM_EMAIL.';
  }
  if (PUBLIC_MAILBOX_DOMAINS.has(senderDomain)) {
    return `Resend cannot send from ${senderDomain}. Verify your own domain in Resend and use RESEND_FROM like Namishkii Support <noreply@send.yourdomain.com>.`;
  }
  return '';
};
const isResendReady = () => hasAnyResendInput && !getResendSetupIssue();

const getEmailSetupIssue = () => {
  if (isSmtpReady() || isResendReady()) return '';
  if (hasAnySmtpInput) return getSmtpSetupIssue();
  if (hasAnyResendInput) return getResendSetupIssue();
  return 'Email service is not configured. Set SMTP or Resend credentials first.';
};

const withTimeout = (promise, ms, label) => {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
};

const normalizeSmtpError = (error) => {
  const rawMessage = trim(error?.message || error?.response || error?.code);
  if (!rawMessage) return 'SMTP send failed.';
  if (/invalid login|username and password not accepted|application-specific password required|534-5\.7\.9/i.test(rawMessage)) {
    return 'Gmail rejected the SMTP login. Turn on 2-Step Verification and use a Gmail App Password for SMTP_PASS.';
  }
  if (/missing credentials/i.test(rawMessage)) {
    return 'SMTP credentials are incomplete. Set SMTP_USER and SMTP_PASS.';
  }
  if (/econnrefused|etimedout|ehostunreach|enotfound/i.test(rawMessage)) {
    return 'SMTP connection failed. Check SMTP_HOST, SMTP_PORT, and network access from Vercel.';
  }
  return rawMessage;
};

const normalizeResendError = (error) => {
  const rawMessage = trim(error?.message || error?.response || error?.code);
  if (!rawMessage) return 'Email send failed.';

  const { senderDomain } = getResendSenderInfo();
  if (/domain is not verified/i.test(rawMessage) && senderDomain) {
    return `Resend rejected the sender because ${senderDomain} is not verified. Verify that domain in Resend and keep RESEND_FROM on the same domain.`;
  }
  if (/only send testing emails to your own email address/i.test(rawMessage) || /resend\.dev/i.test(rawMessage)) {
    return 'Resend test senders only work for your own inbox. Verify a domain in Resend before sending password reset emails to customers.';
  }
  return rawMessage;
};

const getSmtpTransport = () => {
  if (!isSmtpReady()) return null;
  return nodemailer.createTransport({
    host: getSmtpHost(),
    port: getSmtpPort(),
    secure: getSmtpSecure(),
    connectionTimeout: MAIL_TIMEOUT_MS,
    greetingTimeout: MAIL_TIMEOUT_MS,
    socketTimeout: MAIL_TIMEOUT_MS,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
};

const sendViaSmtp = async ({ to, subject, text, html }) => {
  const setupIssue = getSmtpSetupIssue();
  if (setupIssue) {
    return { ok: false, error: setupIssue };
  }
  const tx = getSmtpTransport();
  if (!tx) {
    return { ok: false, error: 'SMTP is not configured.' };
  }
  try {
    await withTimeout(tx.sendMail({
      from: buildSmtpFrom(),
      to,
      subject,
      text,
      html
    }), MAIL_TIMEOUT_MS, 'SMTP send');
    return { ok: true, provider: 'smtp' };
  } catch (error) {
    return { ok: false, error: normalizeSmtpError(error) };
  } finally {
    if (typeof tx.close === 'function') tx.close();
  }
};

const sendViaResend = async ({ to, subject, text, html }) => {
  const setupIssue = getResendSetupIssue();
  if (setupIssue) {
    return { ok: false, error: setupIssue };
  }
  if (!resend) {
    return { ok: false, error: 'Resend is not configured.' };
  }
  try {
    const result = await withTimeout(resend.emails.send({
      from: buildResendFrom(),
      to,
      subject,
      text,
      html
    }), MAIL_TIMEOUT_MS, 'Resend send');
    if (result?.error) {
      return { ok: false, error: normalizeResendError(result.error) };
    }
    return { ok: true, provider: 'resend' };
  } catch (error) {
    return { ok: false, error: normalizeResendError(error) };
  }
};

const sendEmail = async (payload) => {
  const failures = [];

  if (isSmtpReady()) {
    const smtpResult = await sendViaSmtp(payload);
    if (smtpResult.ok) return smtpResult;
    failures.push(smtpResult.error);
  }

  if (isResendReady()) {
    const resendResult = await sendViaResend(payload);
    if (resendResult.ok) return resendResult;
    failures.push(resendResult.error);
  }

  return {
    ok: false,
    error: failures.find(Boolean) || getEmailSetupIssue() || 'Email send failed.'
  };
};

const sendWelcomeEmailDetailed = async (to, name) => sendEmail({
  to,
  subject: 'Welcome to Namiskii',
  text: `Hi ${name || 'there'}, welcome to Namiskii! Your account is ready.`,
  html: `<p>Hi <strong>${name || 'there'}</strong>, welcome to <strong>Namiskii</strong>! Your account is ready.</p>`
});

const sendWelcomeEmail = async (to, name) => {
  try {
    const result = await sendWelcomeEmailDetailed(to, name);
    return result.ok;
  } catch {
    return false;
  }
};

const sendPasswordResetCodeDetailed = async (to, name, code) => sendEmail({
  to,
  subject: 'Namiskii Password Reset Code',
  text: `Hi ${name || 'there'}, your Namiskii reset code is ${code}. It expires in 10 minutes.`,
  html: `<p>Hi <strong>${name || 'there'}</strong>, your Namiskii reset code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`
});

const sendPasswordResetCode = async (to, name, code) => {
  try {
    const result = await sendPasswordResetCodeDetailed(to, name, code);
    return result.ok;
  } catch {
    return false;
  }
};

const isEmailReady = () => Boolean(isSmtpReady() || isResendReady());

const getEmailDiagnostics = () => {
  const resendSender = getResendSenderInfo();
  const smtpSetupIssue = getSmtpSetupIssue();
  const resendSetupIssue = getResendSetupIssue();
  const setupIssue = getEmailSetupIssue();

  return {
    activeProvider: isSmtpReady() ? 'smtp' : (isResendReady() ? 'resend' : null),
    smtp: {
      configured: hasAnySmtpInput,
      ready: isSmtpReady(),
      host: getSmtpHost(),
      port: getSmtpPort() || null,
      secure: getSmtpSecure(),
      from: buildSmtpFrom(),
      user: SMTP_USER,
      setupIssue: hasAnySmtpInput ? (smtpSetupIssue || null) : null
    },
    resend: {
      configured: hasAnyResendInput,
      ready: isResendReady(),
      from: resendSender.from,
      senderEmail: resendSender.senderEmail,
      senderDomain: resendSender.senderDomain,
      setupIssue: hasAnyResendInput ? (resendSetupIssue || null) : null
    },
    setupIssue: setupIssue || null,
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
