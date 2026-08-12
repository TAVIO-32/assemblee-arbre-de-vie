/**
 * index.js — Point d'entrée du serveur Assemblée Arbre de Vie.
 *
 * Sert l'API REST (/api/…) et l'interface web (dossier public/).
 * Démarrage : `npm start` (port 3000 par défaut, variable PORT pour changer).
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // derrière le proxy HTTPS de l'hébergeur (Render…)
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// Quelques en-têtes de sécurité de base.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

// Routes de l'API — chaque module applique son propre contrôle d'accès.
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

// Interface web (SPA) : fichiers statiques + repli sur index.html.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// Gestion d'erreurs : ne jamais renvoyer de détails internes au client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

// Création du schéma (PostgreSQL si DATABASE_URL est défini, sinon SQLite),
// migration depuis l'ancien modèle, puis démarrage du serveur.
const PORT = process.env.PORT || 3000;
db.init()
  .then(() => db.migrer())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Assemblée Arbre de Vie — serveur démarré sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Impossible d\'initialiser la base de données :', err);
    process.exit(1);
  });
