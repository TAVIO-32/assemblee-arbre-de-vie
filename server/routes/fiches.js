const express = require('express');
const db = require('../db');
const { requireAuth, requireDirection } = require('../middleware/auth');

const router = express.Router();

/** POST /api/fiches — soumission publique (pas d'authentification). */
router.post('/', async (req, res) => {
  const { nom, prenom, tribu, departement, adresse, date_naissance, telephone } = req.body || {};
  if (!nom || !prenom) {
    return res.status(400).json({ error: 'Le nom et le prénom sont obligatoires.' });
  }
  await db.insert(`
    INSERT INTO fiches_membres (nom, prenom, tribu, departement, adresse, date_naissance, telephone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    String(nom).trim(),
    String(prenom).trim(),
    String(tribu || '').trim(),
    String(departement || '').trim(),
    String(adresse || '').trim(),
    String(date_naissance || '').trim(),
    String(telephone || '').trim()
  );
  res.status(201).json({ message: 'Merci ! Vos informations ont bien été enregistrées.' });
});

/** GET /api/fiches — liste des fiches (direction uniquement). */
router.get('/', requireAuth, requireDirection, async (req, res) => {
  const fiches = await db.all('SELECT * FROM fiches_membres ORDER BY created_at DESC');
  res.json({ fiches });
});

/** DELETE /api/fiches/:id — supprimer une fiche (direction uniquement). */
router.delete('/:id', requireAuth, requireDirection, async (req, res) => {
  await db.run('DELETE FROM fiches_membres WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
