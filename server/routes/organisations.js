/**
 * routes/organisations.js — Inscription et gestion d'une eglise sur ZAURA.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setSessionCookie } = require('../middleware/auth');
const { PLANS } = require('../constants');

const router = express.Router();

function slugify(nom) {
  return nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

/** POST /api/organisations/register — Creer une eglise + compte pasteur principal. */
router.post('/register', async (req, res) => {
  const { nom_eglise, email, telephone, adresse, nom, prenom, password } = req.body || {};
  if (!nom_eglise || !email || !nom || !prenom || !password) {
    return res.status(400).json({ error: 'Tous les champs obligatoires doivent etre remplis.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caracteres.' });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const existe = await db.get('SELECT id FROM organisations WHERE email = ?', emailNorm);
  if (existe) return res.status(409).json({ error: 'Une eglise est deja inscrite avec cet email.' });

  let slug = slugify(String(nom_eglise));
  const slugExiste = await db.get('SELECT id FROM organisations WHERE slug = ?', slug);
  if (slugExiste) slug = slug + '-' + Date.now().toString(36);

  const dateFin = new Date();
  dateFin.setDate(dateFin.getDate() + 14);

  const orgId = await db.insert(
    `INSERT INTO organisations (nom, slug, email, telephone, adresse, plan, statut, date_fin_essai)
     VALUES (?, ?, ?, ?, ?, 'essai', 'essai', ?)`,
    String(nom_eglise).trim(), slug, emailNorm,
    String(telephone || '').trim(), String(adresse || '').trim(),
    dateFin.toISOString().split('T')[0]
  );

  await db.creerOrgAvecReferentiel(orgId);

  const hash = bcrypt.hashSync(String(password), 10);
  const userId = await db.insert(
    `INSERT INTO users (org_id, nom, prenom, email, telephone, password_hash, role, statut)
     VALUES (?, ?, ?, ?, ?, ?, 'pasteur_principal', 'actif')`,
    orgId, String(nom).trim(), String(prenom).trim(), emailNorm,
    String(telephone || '').trim(), hash
  );

  const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
  setSessionCookie(res, user);
  delete user.password_hash;

  res.status(201).json({
    user,
    organisation: { id: orgId, nom: nom_eglise, slug, plan: 'essai', date_fin_essai: dateFin.toISOString().split('T')[0] },
    message: 'Eglise creee avec succes ! Vous avez 14 jours d\'essai gratuit.',
  });
});

/** GET /api/organisations/plans — Liste des plans disponibles. */
router.get('/plans', (req, res) => {
  res.json({ plans: PLANS });
});

module.exports = router;
