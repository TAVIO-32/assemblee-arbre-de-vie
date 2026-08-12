/**
 * routes/demandes.js — Sujets de prière, préoccupations et besoins.
 *
 * CONFIDENTIALITÉ (appliquée côté serveur) :
 *  - un fidèle ne voit QUE ses propres demandes ;
 *  - un patriarche voit celles des fidèles de SA tribu ;
 *  - un responsable celles des membres de SON département ;
 *  - le corps pastoral voit tout.
 */
const express = require('express');
const db = require('../db');
const { TYPES_DEMANDE, STATUTS_DEMANDE } = require('../constants');
const {
  requireAuth, requireEncadrement, filtreMembres, peutAccederMembre,
} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** POST /api/demandes — un fidèle soumet une demande pour lui-même. */
router.post('/', async (req, res) => {
  const { type, contenu } = req.body || {};
  if (!TYPES_DEMANDE[type]) return res.status(400).json({ error: 'Type de demande invalide.' });
  if (!contenu || !String(contenu).trim()) {
    return res.status(400).json({ error: 'Le contenu est obligatoire.' });
  }
  const id = await db.insert('INSERT INTO demandes (membre_id, type, contenu) VALUES (?, ?, ?)',
    req.user.id, type, String(contenu).trim());
  res.status(201).json({ id });
});

/** GET /api/demandes/me — les demandes du fidèle connecté. */
router.get('/me', async (req, res) => {
  const demandes = await db.all(
    'SELECT id, type, contenu, statut, created_at FROM demandes WHERE membre_id = ? ORDER BY id DESC',
    req.user.id
  );
  res.json({ demandes });
});

/** GET /api/demandes — vue responsable, limitée au périmètre. */
router.get('/', requireEncadrement, async (req, res) => {
  let sql = `
    SELECT dm.*, u.nom, u.prenom, u.tribu_id, t.nom AS tribu_nom
    FROM demandes dm
    JOIN users u ON u.id = dm.membre_id
    LEFT JOIN tribus t ON t.id = u.tribu_id`;
  const params = [];
  const filtre = filtreMembres(req, 'u');
  if (filtre) { sql += ' WHERE ' + filtre.sql; params.push(...filtre.params); }
  sql += ' ORDER BY dm.id DESC LIMIT 300';
  res.json({ demandes: await db.all(sql, ...params) });
});

/** PUT /api/demandes/:id/statut — suivi du traitement. */
router.put('/:id/statut', requireEncadrement, async (req, res) => {
  const demande = await db.get('SELECT * FROM demandes WHERE id = ?', Number(req.params.id));
  if (!demande) return res.status(404).json({ error: 'Demande introuvable.' });
  if (!(await peutAccederMembre(req, demande.membre_id))) {
    return res.status(403).json({ error: 'Cette demande ne relève pas de votre périmètre.' });
  }
  const statut = req.body?.statut;
  if (!STATUTS_DEMANDE[statut]) return res.status(400).json({ error: 'Statut invalide.' });
  await db.run('UPDATE demandes SET statut = ? WHERE id = ?', statut, demande.id);
  res.json({ ok: true });
});

/** DELETE /api/demandes/:id — un fidèle peut retirer sa propre demande. */
router.delete('/:id', async (req, res) => {
  const demande = await db.get('SELECT * FROM demandes WHERE id = ?', Number(req.params.id));
  if (!demande) return res.status(404).json({ error: 'Demande introuvable.' });
  if (demande.membre_id !== req.user.id && !req.perimetre.tout) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }
  await db.run('DELETE FROM demandes WHERE id = ?', demande.id);
  res.json({ ok: true });
});

module.exports = router;
