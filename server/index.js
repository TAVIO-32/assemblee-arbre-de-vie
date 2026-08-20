/**
 * index.js — Point d'entree du serveur ZAURA.
 */
const db = require('./db');
const app = require('./app');

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => db.creerSuperAdmin())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ZAURA — serveur demarre sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Impossible d\'initialiser la base de donnees :', err);
    process.exit(1);
  });
