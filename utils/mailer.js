const nodemailer = require('nodemailer');
const https = require('https');

const MAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || process.env.SMTP_TIMEOUT_MS || 10000);
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM;
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME;
const SENDGRID_API_HOST = process.env.SENDGRID_API_HOST || 'api.sendgrid.com';
const SENDGRID_API_PATH = process.env.SENDGRID_API_PATH || '/v3/mail/send';

const hasSendgrid = Boolean(SENDGRID_API_KEY && SENDGRID_FROM);
const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const withTimeout = (promise, ms, label) => {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
};

const getSmtpTransport = () => {
  if (!hasSmtp) return null;
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

const isEmailReady = () => hasSendgrid || hasSmtp;

const buildFrom = () => {
  if (!SENDGRID_FROM_NAME) return { email: SENDGRID_FROM };
  return { email: SENDGRID_FROM, name: SENDGRID_FROM_NAME };
};

const sendViaSendgrid = async ({ to, subject, text, html }) => {
  if (!hasSendgrid) return false;
  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: buildFrom(),
    subject,
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html', value: html }
    ]
  };
  const body = JSON.stringify(payload);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const req = https.request({
      method: 'POST',
      hostname: SENDGRID_API_HOST,
      path: SENDGRID_API_PATH,
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: MAIL_TIMEOUT_MS
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => finish(res.statusCode >= 200 && res.statusCode < 300));
    });

    req.on('timeout', () => {
      req.destroy();
      finish(false);
    });
    req.on('error', () => finish(false));

    req.write(body);
    req.end();
  });
};

const sendViaSmtp = async ({ to, subject, text, html }) => {
  const tx = getSmtpTransport();
  if (!tx) return false;
  try {
    await withTimeout(tx.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html
    }), MAIL_TIMEOUT_MS, 'SMTP send');
    return true;
  } catch {
    return false;
  }
};

const sendEmail = async (payload) => {
  if (hasSendgrid) {
    const ok = await sendViaSendgrid(payload);
    if (ok) return true;
  }
  if (hasSmtp) return sendViaSmtp(payload);
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

module.exports = { sendWelcomeEmail, sendPasswordResetCode, isEmailReady };
