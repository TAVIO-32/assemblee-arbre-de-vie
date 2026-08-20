/**
 * routes/organisations.js — Inscription et gestion d'une eglise sur ZAURA.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setSessionCookie, requireAuth, requireDirection } = require('../middleware/auth');
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

  let orgId;
  try {
    orgId = await db.insert(
      `INSERT INTO organisations (nom, slug, email, telephone, adresse, plan, statut, date_fin_essai)
       VALUES (?, ?, ?, ?, ?, 'essai', 'essai', ?)`,
      String(nom_eglise).trim(), slug, emailNorm,
      String(telephone || '').trim(), String(adresse || '').trim(),
      dateFin.toISOString().split('T')[0]
    );
  } catch (err) {
    console.error('Erreur creation organisation:', err);
    return res.status(500).json({ error: 'Erreur lors de la creation de l\'eglise. Veuillez reessayer.' });
  }

  try { await db.creerOrgAvecReferentiel(orgId); } catch (err) {
    console.error('Erreur referentiel:', err);
  }

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

/** GET /api/organisations/health — Diagnostic base de donnees. */
router.get('/health', async (req, res) => {
  try {
    await db.get('SELECT 1 AS ok');
    const nbOrgs = await db.get('SELECT COUNT(*) AS n FROM organisations');
    res.json({ db: db.engine, ok: true, organisations: nbOrgs ? nbOrgs.n : 0 });
  } catch (err) {
    res.status(500).json({ db: db.engine, ok: false, error: err.message });
  }
});

/** GET /api/organisations/labels — Labels des sections de l'eglise. */
router.get('/labels', requireAuth, async (req, res) => {
  const params = await db.all('SELECT cle, valeur FROM parametres WHERE org_id = ?', req.org_id);
  const labels = {};
  for (const p of params) if (p.cle.startsWith('label_')) labels[p.cle] = p.valeur;
  res.json({
    label_section1: labels.label_section1 || 'Tribus',
    label_section2: labels.label_section2 || 'Departements',
  });
});

/** PUT /api/organisations/labels — Modifier les labels des sections. */
router.put('/labels', requireAuth, requireDirection, async (req, res) => {
  const { label_section1, label_section2 } = req.body || {};
  const upsert = async (cle, valeur) => {
    if (!valeur) return;
    const v = String(valeur).trim();
    if (!v) return;
    const existe = await db.get('SELECT 1 AS ok FROM parametres WHERE org_id = ? AND cle = ?', req.org_id, cle);
    if (existe) await db.run('UPDATE parametres SET valeur = ? WHERE org_id = ? AND cle = ?', v, req.org_id, cle);
    else await db.run('INSERT INTO parametres (org_id, cle, valeur) VALUES (?, ?, ?)', req.org_id, cle, v);
  };
  await upsert('label_section1', label_section1);
  await upsert('label_section2', label_section2);
  res.json({ ok: true });
});

module.exports = router;
