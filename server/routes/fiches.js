/**
 * routes/fiches.js — Fiches QR de nouveaux fideles (multi-tenant ZAURA).
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireDirection } = require('../middleware/auth');

const router = express.Router();

router.post('/', async (req, res) => {
  const { slug, nom, prenom, tribu, departement, adresse, date_naissance, telephone } = req.body || {};
  if (!nom || !prenom) {
    return res.status(400).json({ error: 'Le nom et le prenom sont obligatoires.' });
  }
  if (!slug) {
    return res.status(400).json({ error: 'Eglise non identifiee.' });
  }

  const org = await db.get('SELECT id FROM organisations WHERE slug = ?', String(slug).trim().toLowerCase());
  if (!org) return res.status(404).json({ error: 'Eglise introuvable.' });

  const nomN = String(nom).trim();
  const prenomN = String(prenom).trim();
  const tribuN = String(tribu || '').trim();
  const deptN = String(departement || '').trim();
  const adresseN = String(adresse || '').trim();
  const dateN = String(date_naissance || '').trim();
  const telN = String(telephone || '').trim();

  await db.insert(`
    INSERT INTO fiches_membres (org_id, nom, prenom, tribu, departement, adresse, date_naissance, telephone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, org.id, nomN, prenomN, tribuN, deptN, adresseN, dateN, telN);

  let tribuId = null;
  if (tribuN && tribuN !== 'Sans tribu') {
    const t = await db.get('SELECT id FROM tribus WHERE org_id = ? AND nom = ?', org.id, tribuN);
    if (t) tribuId = t.id;
  }

  let deptId = null;
  if (deptN && deptN !== 'Sans departement') {
    const d = await db.get('SELECT id FROM departements WHERE org_id = ? AND nom = ?', org.id, deptN);
    if (d) deptId = d.id;
  }

  const fakeEmail = `qr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@qr.local`;
  const fakeHash = `$2b$10$${crypto.randomBytes(32).toString('base64').slice(0, 53)}`;

  const userId = await db.insert(`
    INSERT INTO users (org_id, nom, prenom, email, telephone, date_naissance,
                       password_hash, role, statut, tribu_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'fidele', 'actif', ?)
  `, org.id, nomN, prenomN, fakeEmail, telN, dateN, fakeHash, tribuId);

  if (deptId) {
    await db.run('INSERT INTO membres_departements (membre_id, departement_id) VALUES (?, ?)',
      userId, deptId);
  }

  res.status(201).json({ message: 'Merci ! Vos informations ont bien ete enregistrees.' });
});

router.get('/', requireAuth, requireDirection, async (req, res) => {
  const fiches = await db.all('SELECT * FROM fiches_membres WHERE org_id = ? ORDER BY created_at DESC', req.org_id);
  res.json({ fiches });
});

router.delete('/:id', requireAuth, requireDirection, async (req, res) => {
  await db.run('DELETE FROM fiches_membres WHERE id = ? AND org_id = ?', req.params.id, req.org_id);
  res.json({ ok: true });
});

module.exports = router;
