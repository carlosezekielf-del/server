const https = require('https');

const MAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || process.env.SMTP_TIMEOUT_MS || 10000);
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM;
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME;
const SENDGRID_API_HOST = process.env.SENDGRID_API_HOST || 'api.sendgrid.com';
const SENDGRID_API_PATH = process.env.SENDGRID_API_PATH || '/v3/mail/send';

const isEmailReady = () => Boolean(SENDGRID_API_KEY && SENDGRID_FROM);

const buildFrom = () => {
  if (!SENDGRID_FROM_NAME) return { email: SENDGRID_FROM };
  return { email: SENDGRID_FROM, name: SENDGRID_FROM_NAME };
};

const sendEmail = async ({ to, subject, text, html }) => {
  if (!isEmailReady()) return false;

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
