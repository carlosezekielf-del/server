require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

connectDB();
const app = express();

const envOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URLS,
  process.env.FRONTEND_URL,
  process.env.MOBILE_APP_URL
]
  .filter(Boolean)
  .flatMap((value) => value.split(','))
  .map((value) => value.trim())
  .filter(Boolean);

const parseOriginUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const allowedVercelPrefixes = envOrigins
  .map(parseOriginUrl)
  .filter((value) => value && value.hostname.endsWith('.vercel.app'))
  .map((value) => value.hostname.replace(/\.vercel\.app$/i, ''));

const isAllowedVercelPreviewOrigin = (origin) => {
  const parsed = parseOriginUrl(origin);
  if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.vercel.app')) {
    return false;
  }

  return allowedVercelPrefixes.some((prefix) => (
    parsed.hostname === `${prefix}.vercel.app` ||
    parsed.hostname.startsWith(`${prefix}-`)
  ));
};

const defaultDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultDevOrigins]));
const isDev = process.env.NODE_ENV !== 'production';

app.use(cors({
  origin(origin, cb) {
    const isLocalhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || '');
    if (
      isDev ||
      !origin ||
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin) ||
      isAllowedVercelPreviewOrigin(origin) ||
      isLocalhostOrigin
    ) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/health', require('./routes/health'));

app.use((_, res) => res.status(404).json({ success: false, message: 'Route not found :(' }));
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Namiskii is running on port ${PORT}`));
