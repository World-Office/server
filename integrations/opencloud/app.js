const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Load environment variables early (idempotent)
dotenv.config();

// ── Attempt to load config.js (throws if .env missing/invalid) ────────
let config = null;
try {
  config = require('./lib/config.js');
} catch (err) {
  console.log('[info] Configuration not loaded:', err.message);
  console.log('[info] Navigate to /setup to configure World Office Cloud.');
}

// ── Create Express app ─────────────────────────────────────────────────
const app = express();

// ── Security middleware ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: true,
  credentials: true
}));

// ── Rate limiting (API routes only) ────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);

// ── Body parsing ──────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── View engine ───────────────────────────────────────────────────────
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ── Make config available to all views ────────────────────────────────
app.locals.config = config;

// ── Import routes ─────────────────────────────────────────────────────
const setupRoutes = require('./routes/setup.js');
const dashboardRoutes = require('./routes/dashboard.js');
const apiRoutes = require('./routes/api.js');

// ── Mount routes ──────────────────────────────────────────────────────
// Setup is always available (works without .env)
app.use('/setup', setupRoutes);

// Dashboard and API always available (health endpoint works without config)
app.use('/', dashboardRoutes);
app.use('/api', apiRoutes);

// ── 404 handler ───────────────────────────────────────────────────────
app.use(function (req, res) {
  res.status(404).render('error', {
    title: '404 — Not Found',
    message: 'The page you are looking for does not exist.'
  });
});

// ── Global error handler ──────────────────────────────────────────────
app.use(function (err, req, res, _next) {
  console.error('[error]', err.message || err);
  res.status(err.status || 500).render('error', {
    title: 'Error',
    message: err.message || 'An unexpected error occurred.'
  });
});

// ── Start server ──────────────────────────────────────────────────────
const PORT = config ? config.PORT : (process.env.PORT || 3000);
app.listen(PORT, function () {
  console.log('');
  console.log('  World Office Cloud Dashboard');
  console.log('  ─────────────────────────────');
  console.log('  Local:   http://localhost:' + PORT);
  if (config) {
    console.log('  OCIS:    ' + (config.ENABLE_SSL ? 'https' : 'http') + '://' + config.OCIS_DOMAIN);
    console.log('  Docs:    ' + (config.ENABLE_SSL ? 'https' : 'http') + '://' + config.DOCUMENT_SERVER_DOMAIN);
  } else {
    console.log('  Setup:   http://localhost:' + PORT + '/setup');
  }
  console.log('');
});

// ── Graceful shutdown ─────────────────────────────────────────────────
process.on('SIGTERM', function () {
  console.log('[info] SIGTERM received — shutting down');
  process.exit(0);
});

process.on('SIGINT', function () {
  console.log('[info] SIGINT received — shutting down');
  process.exit(0);
});

module.exports = app;
