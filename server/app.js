/**
 * app.js — Application Express (sans listen).
 *
 * Importé par index.js (développement local) et api/index.js (Vercel serverless).
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
  next();
});

app.use('/api/referentiel', require('./routes/referentiel'));
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

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

module.exports = app;
