const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const { protect, generateToken } = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');
const {
  sendWelcomeEmail,
  sendPasswordResetCodeDetailed,
  isEmailReady,
  getEmailDiagnostics
} = require('../utils/mailer');

const googleClient = new OAuth2Client();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
const normalizeName = (name) => String(name || '').replace(/\s+/g, ' ').trim();
const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');
const normalizeZipCode = (zipCode) => String(zipCode || '').replace(/\D/g, '').slice(0, 4);
const isValidName = (name) => /^[A-Za-z\s'.-]+$/.test(name);
const isStrongPassword = (password) => {
  const value = String(password || '');
  return value.length >= 8 && value.length <= 20 && /[A-Za-z]/.test(value) && /\d/.test(value);
};
const splitAddress = (address) => {
  const parts = String(address || '').split(',').map((value) => value.trim()).filter(Boolean);
  return {
    street: parts[0] || '',
    city: parts[1] || '',
    zipCode: normalizeZipCode(parts[2] || ''),
    country: parts[3] || 'Philippines'
  };
};
const buildAddress = ({ street = '', city = '', zipCode = '', country = 'Philippines' }) => (
  [street, city, normalizeZipCode(zipCode), country]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ')
);
const validateProfileFields = ({ name, phone, address }) => {
  const cleanName = normalizeName(name);
  const cleanPhone = normalizePhone(phone);
  const parsedAddress = splitAddress(address);

  if (!cleanName || cleanName.length < 2) return 'Name must be at least 2 characters';
  if (/\d/.test(cleanName)) return 'Name cannot contain numbers';
  if (!isValidName(cleanName)) return 'Name contains invalid characters';
  if (!/^09\d{9}$/.test(cleanPhone)) return 'Phone must be 11 digits and start with 09';
  if (!parsedAddress.street) return 'Street is required';
  if (!parsedAddress.city) return 'Municipality / City is required';
  if (!/^\d{4}$/.test(parsedAddress.zipCode)) return 'Zip code must be exactly 4 digits';
  if (!parsedAddress.country) return 'Country is required';

  return '';
};
const isRealGoogleClientId = (id) => {
  const v = String(id || '').trim();
  if (!v) return false;
  if (!v.endsWith('.apps.googleusercontent.com')) return false;
  if (v.toLowerCase().startsWith('your_')) return false;
  return true;
};
const getGoogleClientIds = () => ([
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_EXPO_CLIENT_ID
].map((id) => String(id || '').trim()).filter(isRealGoogleClientId));
const getGoogleClientIdResponse = () => {
  const web = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const android = String(process.env.GOOGLE_ANDROID_CLIENT_ID || '').trim();
  const ios = String(process.env.GOOGLE_IOS_CLIENT_ID || '').trim();
  const expo = String(process.env.GOOGLE_EXPO_CLIENT_ID || '').trim();
  return {
    clientId: isRealGoogleClientId(web) ? web : '',
    androidClientId: isRealGoogleClientId(android) ? android : '',
    iosClientId: isRealGoogleClientId(ios) ? ios : '',
    expoClientId: isRealGoogleClientId(expo) ? expo : ''
  };
};

const setResetCodeForUser = async (user) => {
  const code = String(crypto.randomInt(100000, 999999));
  user.resetCodeHash = crypto.createHash('sha256').update(code).digest('hex');
  user.resetCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  return code;
};

const getEmailStatusMessage = () => {
  const diagnostics = getEmailDiagnostics();
  return diagnostics?.setupIssue || 'Email service is not configured. Set SMTP or Resend credentials first.';
};

router.get('/google-client-id', (req, res) => {
  res.json({
    success: true,
    ...getGoogleClientIdResponse()
  });
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;
    const cleanName = normalizeName(name);
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
    }
    if (/\d/.test(cleanName)) {
      return res.status(400).json({ success: false, message: 'Name cannot contain numbers' });
    }
    if (!isValidName(cleanName)) {
      return res.status(400).json({ success: false, message: 'Name contains invalid characters' });
    }
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ success: false, message: 'Valid email required' });
    if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: 'Password must be 8 to 20 characters and include letters and numbers' });
    }
    const cleanPhone = normalizePhone(phone);
    if (!/^09\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Phone must be 11 digits and start with 09' });
    }

    const exists = await User.findOne({ email: cleanEmail });
    if (exists) return res.status(400).json({ success: false, message: 'Email already registered' });

    const user = await User.create({ name: cleanName, email: cleanEmail, password, phone: cleanPhone, address, role: 'customer' });
    sendWelcomeEmail(user.email, user.name).catch(() => {});
    res.status(201).json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        address: user.address || '',
        avatar: user.avatar || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Google credential required' });

    const googleClientIds = getGoogleClientIds();
    if (!googleClientIds.length) {
      return res.status(503).json({ success: false, message: 'Google login is not configured.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientIds
    });
    const payload = ticket.getPayload();
    const email = payload?.email;
    const name = payload?.name || 'Google User';
    if (!email) return res.status(400).json({ success: false, message: 'Invalid Google account payload' });

    let user = await User.findOne({ email }).select('+password');
    if (!user) {
      user = await User.create({
        name,
        email,
        password: `google_${Math.random().toString(36).slice(2)}${Date.now()}`,
        role: 'customer',
        avatar: payload?.picture || ''
      });
      sendWelcomeEmail(user.email, user.name).catch(() => {});
    }

    res.json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        address: user.address || '',
        avatar: user.avatar || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Google login failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ success: false, message: 'Valid email required' });

    const user = await User.findOne({ email: cleanEmail }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    res.json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        address: user.address || '',
        avatar: user.avatar || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

router.put('/profile', protect, async (req, res) => {
  try {
    const { name, phone, address, avatar } = req.body;
    const validationError = validateProfileFields({ name, phone, address });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const updates = {
      name: normalizeName(name),
      phone: normalizePhone(phone),
      address: buildAddress(splitAddress(address))
    };
    if (typeof avatar === 'string') updates.avatar = avatar;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        address: user.address || '',
        avatar: user.avatar || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/password/send-code', protect, async (req, res) => {
  try {
    if (!isEmailReady()) {
      return res.status(503).json({ success: false, message: getEmailStatusMessage() });
    }
    const user = await User.findById(req.user._id).select('+resetCodeHash +resetCodeExpiresAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const code = await setResetCodeForUser(user);
    const sendResult = await sendPasswordResetCodeDetailed(user.email, user.name, code);
    if (!sendResult.ok) {
      return res.status(503).json({ success: false, message: sendResult.error || 'Failed to send reset code. Check email configuration.' });
    }
    res.json({ success: true, message: 'Reset code sent to your email' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to send reset code' });
  }
});

router.post('/password/forgot/send-code', async (req, res) => {
  try {
    if (!isEmailReady()) {
      return res.status(503).json({ success: false, message: getEmailStatusMessage() });
    }
    const { email } = req.body;
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }

    const user = await User.findOne({ email: cleanEmail }).select('+resetCodeHash +resetCodeExpiresAt');
    if (user) {
      const code = await setResetCodeForUser(user);
      const sendResult = await sendPasswordResetCodeDetailed(user.email, user.name, code);
      if (!sendResult.ok) {
        return res.status(503).json({ success: false, message: sendResult.error || 'Failed to send reset code. Check email configuration.' });
      }
    }

    return res.json({ success: true, message: 'If the account exists, a reset code was sent to email' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to send reset code' });
  }
});

router.put('/password/reset', protect, async (req, res) => {
  try {
    const { code, newPassword } = req.body;
    if (!code || !newPassword) return res.status(400).json({ success: false, message: 'Code and new password are required' });
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ success: false, message: 'Password must be 8 to 20 characters and include letters and numbers' });
    }

    const user = await User.findById(req.user._id).select('+password +resetCodeHash +resetCodeExpiresAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.resetCodeHash || !user.resetCodeExpiresAt || new Date(user.resetCodeExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Reset code expired. Request a new one.' });
    }

    const incomingHash = crypto.createHash('sha256').update(String(code)).digest('hex');
    if (incomingHash !== user.resetCodeHash) {
      return res.status(400).json({ success: false, message: 'Invalid reset code' });
    }

    user.password = newPassword;
    user.resetCodeHash = '';
    user.resetCodeExpiresAt = null;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Password reset failed' });
  }
});

router.put('/password/forgot/reset', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }
    if (!code || !newPassword) return res.status(400).json({ success: false, message: 'Code and new password are required' });
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ success: false, message: 'Password must be 8 to 20 characters and include letters and numbers' });
    }

    const user = await User.findOne({ email: cleanEmail }).select('+password +resetCodeHash +resetCodeExpiresAt');
    if (!user) return res.status(400).json({ success: false, message: 'Invalid email or reset code' });
    if (!user.resetCodeHash || !user.resetCodeExpiresAt || new Date(user.resetCodeExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Reset code expired. Request a new one.' });
    }

    const incomingHash = crypto.createHash('sha256').update(String(code)).digest('hex');
    if (incomingHash !== user.resetCodeHash) {
      return res.status(400).json({ success: false, message: 'Invalid email or reset code' });
    }

    user.password = newPassword;
    user.resetCodeHash = '';
    user.resetCodeExpiresAt = null;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully. Please log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Password reset failed' });
  }
});

module.exports = router;
