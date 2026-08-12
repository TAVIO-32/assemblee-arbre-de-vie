/**
 * routes/cotisations.js — Suivi des cotisations.
 * Enregistrement par le corps pastoral (tous les fidèles), par un patriarche
 * (sa tribu) ou par un responsable (son département).
 * Un fidèle ne consulte que ses propres cotisations via /me.
 */
const express = require('express');
const db = require('../db');
const {
  requireAuth, requireEncadrement, filtreMembres, peutAccederMembre,
} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** GET /api/cotisations/me — cotisations du fidèle connecté. */
router.get('/me', async (req, res) => {
  const cotisations = await db.all(
    'SELECT id, montant, libelle, date, statut FROM cotisations WHERE membre_id = ? ORDER BY date DESC',
    req.user.id
  );
  res.json({ cotisations });
});

/** GET /api/cotisations — cotisations des fidèles du périmètre. */
router.get('/', requireEncadrement, async (req, res) => {
  let sql = `
    SELECT c.*, u.nom, u.prenom, u.tribu_id, t.nom AS tribu_nom
    FROM cotisations c
    JOIN users u ON u.id = c.membre_id
    LEFT JOIN tribus t ON t.id = u.tribu_id`;
  const params = [];
  const filtre = filtreMembres(req, 'u');
  if (filtre) { sql += ' WHERE ' + filtre.sql; params.push(...filtre.params); }
  sql += ' ORDER BY c.date DESC, c.id DESC LIMIT 300';
  res.json({ cotisations: await db.all(sql, ...params) });
});

/** POST /api/cotisations — enregistrement pour un fidèle de son périmètre. */
router.post('/', requireEncadrement, async (req, res) => {
  const { membre_id, montant, libelle, date, statut } = req.body || {};
  const m = Number(montant);
  if (!membre_id || !Number.isFinite(m) || m <= 0 || !date) {
    return res.status(400).json({ error: 'Fidèle, montant positif et date obligatoires.' });
  }
  if (!(await peutAccederMembre(req, membre_id))) {
    return res.status(403).json({ error: 'Ce fidèle ne relève pas de votre périmètre.' });
  }
  const id = await db.insert(`
    INSERT INTO cotisations (membre_id, montant, libelle, date, statut, enregistre_par)
    VALUES (?, ?, ?, ?, ?, ?)
  `, Number(membre_id), m, String(libelle || '').trim(), String(date).slice(0, 10),
     statut === 'paye' ? 'paye' : 'non_paye', req.user.id);
  res.status(201).json({ id });
});

/** Vérifie que la cotisation existe et relève du périmètre du demandeur. */
async function chargerCotisation(req, res) {
  const c = await db.get('SELECT * FROM cotisations WHERE id = ?', Number(req.params.id));
  if (!c) { res.status(404).json({ error: 'Cotisation introuvable.' }); return null; }
  if (!(await peutAccederMembre(req, c.membre_id))) {
    res.status(403).json({ error: 'Accès refusé.' });
    return null;
  }
  return c;
}

/** PUT /api/cotisations/:id — bascule payé / non payé. */
router.put('/:id', requireEncadrement, async (req, res) => {
  const c = await chargerCotisation(req, res);
  if (!c) return;
  const statut = req.body?.statut === 'paye' ? 'paye' : 'non_paye';
  await db.run('UPDATE cotisations SET statut = ? WHERE id = ?', statut, c.id);
  res.json({ ok: true });
});

/** DELETE /api/cotisations/:id — suppression d'une saisie erronée. */
router.delete('/:id', requireEncadrement, async (req, res) => {
  const c = await chargerCotisation(req, res);
  if (!c) return;
  await db.run('DELETE FROM cotisations WHERE id = ?', c.id);
  res.json({ ok: true });
});

module.exports = router;
