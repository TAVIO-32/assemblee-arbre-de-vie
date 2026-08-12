/**
 * routes/auth.js — Inscription, connexion, session.
 *
 * Règles :
 *  - Le TOUT PREMIER compte créé devient automatiquement le Pasteur Principal
 *    (statut actif) : c'est l'administrateur de l'assemblée.
 *  - Tout autre compte est créé « en attente » : il ne peut pas se connecter
 *    tant qu'un pasteur ne l'a pas validé (attribution du rôle, de la tribu
 *    et des départements).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');
const { departementsDe } = require('../services/membres');

const router = express.Router();

/** POST /api/auth/register — inscription libre. */
router.post('/register', async (req, res) => {
  const { nom, prenom, email, telephone, whatsapp, date_naissance,
          tribu_souhaitee, departement_souhaite, password } = req.body || {};
  if (!nom || !prenom || !email || !password) {
    return res.status(400).json({ error: 'Nom, prénom, email et mot de passe sont obligatoires.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  const existe = await db.get('SELECT id FROM users WHERE lower(email) = ?', emailNorm);
  if (existe) return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });

  const premierCompte = (await db.get('SELECT COUNT(*) AS n FROM users')).n === 0;
  const hash = bcrypt.hashSync(String(password), 10);

  const id = await db.insert(`
    INSERT INTO users (nom, prenom, email, telephone, whatsapp, date_naissance,
                       tribu_souhaitee, departement_souhaite, password_hash, role, statut)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    String(nom).trim(), String(prenom).trim(), emailNorm,
    String(telephone || '').trim(), String(whatsapp || '').trim(),
    String(date_naissance || '').trim(),
    String(tribu_souhaitee || '').trim(), String(departement_souhaite || '').trim(),
    hash,
    premierCompte ? 'pasteur_principal' : 'fidele',
    premierCompte ? 'actif' : 'en_attente'
  );

  if (premierCompte) {
    // Premier compte = Pasteur Principal : connexion immédiate.
    const user = await db.get('SELECT * FROM users WHERE id = ?', id);
    setSessionCookie(res, user);
    delete user.password_hash;
    return res.status(201).json({ user, message: 'Compte Pasteur Principal créé.' });
  }
  res.status(201).json({
    message: 'Compte créé. Il sera actif après validation par un pasteur de l\'assemblée.',
  });
});

/** POST /api/auth/login — connexion par email OU téléphone + mot de passe. */
router.post('/login', async (req, res) => {
  const { identifiant, password } = req.body || {};
  if (!identifiant || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  }
  const ident = String(identifiant).trim();
  const user = await db.get(
    "SELECT * FROM users WHERE lower(email) = lower(?) OR (telephone != '' AND telephone = ?)",
    ident, ident
  );

  // Message identique que le compte existe ou non (évite l'énumération de comptes).
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  if (user.statut === 'en_attente') {
    return res.status(403).json({ error: 'Votre compte est en attente de validation par un pasteur.' });
  }
  if (user.statut === 'rejete') {
    return res.status(403).json({ error: "Votre demande de compte n'a pas été acceptée. Contactez un responsable." });
  }
  setSessionCookie(res, user);
  delete user.password_hash;
  res.json({ user });
});

/** POST /api/auth/logout — déconnexion. */
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** GET /api/auth/me — profil complet du connecté : tribu, départements, périmètre. */
router.get('/me', requireAuth, async (req, res) => {
  const tribu = req.user.tribu_id
    ? await db.get('SELECT id, nom FROM tribus WHERE id = ?', req.user.tribu_id)
    : null;
  const departements = await departementsDe(req.user.id);

  // Équipes effectivement conduites (alimente la navigation de l'interface).
  const { tribus: idsTribus, departements: idsDepts } = req.perimetre;
  const tribusConduites = idsTribus.length
    ? await db.all(`SELECT id, nom FROM tribus WHERE id IN (${db.placeholders(idsTribus.length)}) ORDER BY nom`, ...idsTribus)
    : [];
  const departementsConduits = idsDepts.length
    ? await db.all(`SELECT id, nom FROM departements WHERE id IN (${db.placeholders(idsDepts.length)}) ORDER BY nom`, ...idsDepts)
    : [];

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
  });
});

module.exports = router;
