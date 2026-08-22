/**
 * routes/auth.js — Connexion / inscription / session (multi-tenant ZAURA).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');
const { departementsDe } = require('../services/membres');

const router = express.Router();

/** POST /api/auth/register — Inscription d'un fidele dans une eglise existante. */
router.post('/register', async (req, res) => {
  const { slug, nom, prenom, email, telephone, whatsapp, date_naissance,
          tribu_souhaitee, departement_souhaite, password } = req.body || {};
  if (!slug || !nom || !prenom || !email || !password) {
    return res.status(400).json({ error: 'Tous les champs obligatoires doivent etre remplis.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caracteres.' });
  }

  const org = await db.get('SELECT * FROM organisations WHERE slug = ?', String(slug).trim().toLowerCase());
  if (!org) return res.status(404).json({ error: 'Eglise introuvable.' });
  if (org.statut === 'suspendu' || org.statut === 'expire') {
    return res.status(403).json({ error: "Les inscriptions sont suspendues pour cette eglise." });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const existe = await db.get('SELECT id FROM users WHERE org_id = ? AND lower(email) = ?', org.id, emailNorm);
  if (existe) return res.status(409).json({ error: 'Un compte existe deja avec cet email dans cette eglise.' });

  const hash = bcrypt.hashSync(String(password), 10);
  await db.insert(`
    INSERT INTO users (org_id, nom, prenom, email, telephone, whatsapp, date_naissance,
                       tribu_souhaitee, departement_souhaite, password_hash, role, statut)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fidele', 'en_attente')
  `,
    org.id, String(nom).trim(), String(prenom).trim(), emailNorm,
    String(telephone || '').trim(), String(whatsapp || '').trim(),
    String(date_naissance || '').trim(),
    String(tribu_souhaitee || '').trim(), String(departement_souhaite || '').trim(),
    hash
  );

  res.status(201).json({
    message: "Compte cree. Il sera actif apres validation par un pasteur de l'assemblee.",
  });
});

/** POST /api/auth/login — Connexion (email ou telephone + mot de passe). */
router.post('/login', async (req, res) => {
  const { identifiant, password, slug } = req.body || {};
  if (!identifiant || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  }
  const ident = String(identifiant).trim();

  let user;
  if (slug) {
    const org = await db.get('SELECT id FROM organisations WHERE slug = ?', String(slug).trim().toLowerCase());
    if (!org) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    user = await db.get(
      "SELECT * FROM users WHERE org_id = ? AND (lower(email) = lower(?) OR (telephone != '' AND telephone = ?))",
      org.id, ident, ident
    );
  } else {
    user = await db.get(
      "SELECT * FROM users WHERE lower(email) = lower(?) OR (telephone != '' AND telephone = ?)",
      ident, ident
    );
  }

  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    const app = req.app;
    if (app.recordFailedLogin) app.recordFailedLogin(req);
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  if (user.statut === 'en_attente') {
    return res.status(403).json({ error: 'Votre compte est en attente de validation par un pasteur.' });
  }
  if (user.statut === 'rejete') {
    return res.status(403).json({ error: "Votre demande de compte n'a pas ete acceptee." });
  }

  const org = await db.get('SELECT * FROM organisations WHERE id = ?', user.org_id);
  if (org && (org.statut === 'suspendu' || org.statut === 'expire')) {
    return res.status(403).json({ error: 'Abonnement de votre eglise expire ou suspendu.' });
  }

  setSessionCookie(res, user);
  delete user.password_hash;
  res.json({ user, organisation: org ? { nom: org.nom, slug: org.slug, plan: org.plan } : null });
});

/** POST /api/auth/logout */
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** GET /api/auth/me — Profil complet + info organisation. */
router.get('/me', requireAuth, async (req, res) => {
  const tribu = req.user.tribu_id
    ? await db.get('SELECT id, nom FROM tribus WHERE id = ?', req.user.tribu_id)
    : null;
  const departements = await departementsDe(req.user.id);

  const { tribus: idsTribus, departements: idsDepts } = req.perimetre;
  const tribusConduites = idsTribus.length
    ? await db.all(`SELECT id, nom FROM tribus WHERE id IN (${db.placeholders(idsTribus.length)}) ORDER BY nom`, ...idsTribus)
    : [];
  const departementsConduits = idsDepts.length
    ? await db.all(`SELECT id, nom FROM departements WHERE id IN (${db.placeholders(idsDepts.length)}) ORDER BY nom`, ...idsDepts)
    : [];

  const params = await db.all('SELECT cle, valeur FROM parametres WHERE org_id = ?', req.org_id);
  const labels = {};
  for (const p of params) labels[p.cle] = p.valeur;

  const abonnement = await db.get(
    "SELECT * FROM abonnements WHERE org_id = ? AND statut = 'actif' ORDER BY date_fin DESC LIMIT 1",
    req.org_id
  );

  res.json({
    user: {
      ...req.user,
      tribu_nom: tribu ? tribu.nom : null,
      departements,
      perimetre: {
        tout: req.perimetre.tout,
        tribus: tribusConduites,
        departements: departementsConduits,
      },
    },
    organisation: {
      id: req.org.id,
      nom: req.org.nom,
      slug: req.org.slug,
      plan: req.org.plan,
      statut: req.org.statut,
      date_fin_essai: req.org.date_fin_essai || null,
      abonnement: abonnement ? { plan: abonnement.plan, date_fin: abonnement.date_fin, moyen: abonnement.moyen_paiement } : null,
      label_section1: labels.label_section1 || 'Tribus',
      label_section2: labels.label_section2 || 'Departements',
    },
  });
});

module.exports = router;
