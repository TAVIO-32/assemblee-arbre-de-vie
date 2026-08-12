/**
 * api/index.js — Point d'entrée Vercel (serverless function).
 *
 * La base est initialisée une seule fois au cold start ; les requêtes
 * suivantes réutilisent la même connexion et la promesse déjà résolue.
 */
const db = require('../server/db');
const app = require('../server/app');

const ready = db.init().then(() => db.migrer());

module.exports = async (req, res) => {
  await ready;
  app(req, res);
};
