/**
 * app.js — Application Express ZAURA (sans listen).
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set('X-XSS-Protection', '1; mode=block');
  next();
});

const _loginAttempts = new Map();
function rateLimitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = _loginAttempts.get(ip);
  if (entry) {
    entry.attempts = entry.attempts.filter((t) => now - t < 15 * 60 * 1000);
    if (entry.attempts.length >= 10) {
      const oldest = entry.attempts[0];
      const wait = Math.ceil((15 * 60 * 1000 - (now - oldest)) / 60000);
      return res.status(429).json({ error: `Trop de tentatives. Reessayez dans ${wait} min.` });
    }
  }
  req._rlEntry = entry || { attempts: [] };
  if (!entry) _loginAttempts.set(ip, req._rlEntry);
  next();
}
function recordFailedLogin(req) {
  if (req._rlEntry) req._rlEntry.attempts.push(Date.now());
}
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [ip, entry] of _loginAttempts) {
    entry.attempts = entry.attempts.filter((t) => t > cutoff);
    if (!entry.attempts.length) _loginAttempts.delete(ip);
  }
}, 5 * 60 * 1000);

app.use('/api/organisations', require('./routes/organisations'));
app.use('/api/admin', require('./routes/super-admin'));
app.use('/api/referentiel', require('./routes/referentiel'));
app.post('/api/auth/login', rateLimitLogin);
app.post('/api/admin/login', rateLimitLogin);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/tribus', require('./routes/tribus'));
app.use('/api/departements', require('./routes/departements'));
app.use('/api/evenements', require('./routes/evenements'));
app.use('/api/cotisations', require('./routes/cotisations'));
app.use('/api/demandes', require('./routes/demandes'));
app.use('/api/annonces', require('./routes/annonces'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/fiches', require('./routes/fiches'));
app.use('/api/bible', require('./routes/bible'));
app.use('/api/wave', require('./routes/wave'));

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

app.recordFailedLogin = recordFailedLogin;
module.exports = app;
