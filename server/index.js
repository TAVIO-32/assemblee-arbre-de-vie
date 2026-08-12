/**
 * index.js — Point d'entrée du serveur Assemblée Arbre de Vie.
 *
 * Démarrage : `npm start` (port 3000 par défaut, variable PORT pour changer).
 * En production sur Vercel, c'est api/index.js qui sert de point d'entrée.
 */
const db = require('./db');
const app = require('./app');

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
