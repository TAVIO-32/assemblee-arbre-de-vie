const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireDirection } = require('../middleware/auth');

const router = express.Router();

/** POST /api/fiches — soumission publique (pas d'authentification). */
router.post('/', async (req, res) => {
  const { nom, prenom, tribu, departement, adresse, date_naissance, telephone } = req.body || {};
  if (!nom || !prenom) {
    return res.status(400).json({ error: 'Le nom et le prénom sont obligatoires.' });
  }

  const nomN = String(nom).trim();
  const prenomN = String(prenom).trim();
  const tribuN = String(tribu || '').trim();
  const deptN = String(departement || '').trim();
  const adresseN = String(adresse || '').trim();
  const dateN = String(date_naissance || '').trim();
  const telN = String(telephone || '').trim();

  await db.insert(`
    INSERT INTO fiches_membres (nom, prenom, tribu, departement, adresse, date_naissance, telephone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, nomN, prenomN, tribuN, deptN, adresseN, dateN, telN);

  let tribuId = null;
  if (tribuN && tribuN !== 'Sans tribu') {
    const t = await db.get('SELECT id FROM tribus WHERE nom = ?', tribuN);
    if (t) tribuId = t.id;
  }

  let deptId = null;
  if (deptN && deptN !== 'Sans departement') {
    const d = await db.get('SELECT id FROM departements WHERE nom = ?', deptN);
    if (d) deptId = d.id;
  }

  const fakeEmail = `qr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@qr.local`;
  const fakeHash = `$2b$10$${crypto.randomBytes(32).toString('base64').slice(0, 53)}`;

  const userId = await db.insert(`
    INSERT INTO users (nom, prenom, email, telephone, date_naissance,
                       password_hash, role, statut, tribu_id)
    VALUES (?, ?, ?, ?, ?, ?, 'fidele', 'actif', ?)
  `, nomN, prenomN, fakeEmail, telN, dateN, fakeHash, tribuId);

  if (deptId) {
    await db.run('INSERT INTO membres_departements (membre_id, departement_id) VALUES (?, ?)',
      userId, deptId);
  }

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
