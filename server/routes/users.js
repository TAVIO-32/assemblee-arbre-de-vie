/**
 * routes/users.js — Comptes et fiches des fidèles.
 *
 * Périmètres :
 *  - corps pastoral : tous les comptes ; valide, rejette, attribue rôle,
 *    tribu et départements ;
 *  - patriarche / responsable : les fidèles de sa tribu ou de son département,
 *    en consultation (fiche + assiduité) ;
 *  - fidèle : son propre profil uniquement.
 *
 * Règle hiérarchique : on ne peut jamais attribuer — ni modifier — un rôle de
 * niveau supérieur ou égal au sien. Seul le Pasteur Principal y échappe.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { CODES_ROLES } = require('../constants');
const {
  requireAuth, requireDirection, filtreMembres, peutAccederMembre, peutGererRole,
} = require('../middleware/auth');
const {
  CHAMPS_PUBLICS, JOINTURE_TRIBU, avecDepartements, departementsDe,
  definirDepartements, assiduite,
} = require('../services/membres');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/users — liste selon le périmètre.
 * Filtres : ?statut= &role= &tribu_id= &departement_id= &q=
 */
router.get('/', async (req, res) => {
  let sql = `SELECT ${CHAMPS_PUBLICS} FROM users u ${JOINTURE_TRIBU}`;
  const conditions = [];
  const params = [];

  const filtre = filtreMembres(req, 'u');
  if (filtre) {
    conditions.push(filtre.sql);
    params.push(...filtre.params);
    // Hors corps pastoral, seuls les comptes actifs sont visibles.
    conditions.push("u.statut = 'actif'");
  } else if (req.query.statut) {
    conditions.push('u.statut = ?');
    params.push(String(req.query.statut));
  }

  if (req.query.role && CODES_ROLES.includes(req.query.role)) {
    conditions.push('u.role = ?');
    params.push(req.query.role);
  }
  if (req.query.tribu_id) {
    conditions.push('u.tribu_id = ?');
    params.push(Number(req.query.tribu_id));
  }
  if (req.query.departement_id) {
    conditions.push('u.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?)');
    params.push(Number(req.query.departement_id));
  }
  if (req.query.q) {
    conditions.push('(lower(u.nom) LIKE ? OR lower(u.prenom) LIKE ? OR lower(u.email) LIKE ?)');
    const motif = `%${String(req.query.q).trim().toLowerCase()}%`;
    params.push(motif, motif, motif);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY u.nom, u.prenom';
  res.json({ users: await avecDepartements(await db.all(sql, ...params)) });
});

/** PUT /api/users/me — un utilisateur met à jour son propre profil. */
router.put('/me', async (req, res) => {
  const { nom, prenom, telephone, whatsapp, date_naissance, password } = req.body || {};
  if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom obligatoires.' });
  if (password && String(password).length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }
  await db.run(`
    UPDATE users SET nom = ?, prenom = ?, telephone = ?, whatsapp = ?, date_naissance = ?
    WHERE id = ?
  `,
    String(nom).trim(), String(prenom).trim(), String(telephone || '').trim(),
    String(whatsapp || '').trim(), String(date_naissance || '').trim(), req.user.id
  );
  if (password) {
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?',
      bcrypt.hashSync(String(password), 10), req.user.id);
  }
  res.json({ ok: true, message: 'Profil mis à jour.' });
});

/** GET /api/users/:id — fiche détaillée d'un fidèle (avec assiduité). */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await peutAccederMembre(req, id))) {
    return res.status(403).json({ error: 'Ce fidèle ne relève pas de votre périmètre.' });
  }
  const membre = await db.get(
    `SELECT ${CHAMPS_PUBLICS} FROM users u ${JOINTURE_TRIBU} WHERE u.id = ?`, id);
  if (!membre) return res.status(404).json({ error: 'Fidèle introuvable.' });

  const historique = await db.all(`
    SELECT e.titre, e.type, e.date, e.portee, p.statut
    FROM presences p JOIN evenements e ON e.id = p.evenement_id
    WHERE p.membre_id = ? ORDER BY e.date DESC, e.id DESC LIMIT 50
  `, id);

  res.json({
    membre: { ...membre, departements: await departementsDe(id) },
    assiduite: await assiduite(id),
    historique,
  });
});

/* ----- Actions réservées au corps pastoral ----- */

/** Vérifie qu'on a le droit d'agir sur ce compte et de lui donner ce rôle. */
async function controlerCible(req, res, roleDemande) {
  const cible = await db.get('SELECT * FROM users WHERE id = ?', Number(req.params.id));
  if (!cible) { res.status(404).json({ error: 'Compte introuvable.' }); return null; }
  if (cible.id !== req.user.id && !peutGererRole(req.user, cible.role)) {
    res.status(403).json({ error: `Vous ne pouvez pas agir sur un compte de niveau ${cible.role}.` });
    return null;
  }
  if (roleDemande !== undefined) {
    if (!CODES_ROLES.includes(roleDemande)) {
      res.status(400).json({ error: 'Rôle invalide.' }); return null;
    }
    if (!peutGererRole(req.user, roleDemande)) {
      res.status(403).json({ error: 'Vous ne pouvez pas attribuer un rôle égal ou supérieur au vôtre.' });
      return null;
    }
  }
  return cible;
}

/** POST /api/users/:id/valider — active un compte : rôle + tribu + départements. */
router.post('/:id/valider', requireDirection, async (req, res) => {
  const { role, tribu_id, departement_ids } = req.body || {};
  const cible = await controlerCible(req, res, role);
  if (!cible) return;

  if (tribu_id) {
    const tribu = await db.get('SELECT id FROM tribus WHERE id = ?', Number(tribu_id));
    if (!tribu) return res.status(400).json({ error: 'Tribu inconnue.' });
  }

  await db.run("UPDATE users SET statut = 'actif', role = ?, tribu_id = ? WHERE id = ?",
    role, tribu_id ? Number(tribu_id) : null, cible.id);
  await definirDepartements(cible.id, departement_ids);

  res.json({ ok: true, message: 'Compte validé et activé.' });
});

/** POST /api/users/:id/rejeter — refus d'une demande de compte. */
router.post('/:id/rejeter', requireDirection, async (req, res) => {
  const cible = await controlerCible(req, res);
  if (!cible) return;
  if (cible.id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas rejeter votre propre compte.' });
  }
  await db.run("UPDATE users SET statut = 'rejete' WHERE id = ?", cible.id);
  res.json({ ok: true });
});

/** PUT /api/users/:id — modification du rôle, de la tribu et des départements. */
router.put('/:id', requireDirection, async (req, res) => {
  const { role, tribu_id, departement_ids } = req.body || {};
  const cible = await controlerCible(req, res, role);
  if (!cible) return;

  // L'assemblée doit toujours conserver un Pasteur Principal.
  if (cible.role === 'pasteur_principal' && role !== 'pasteur_principal') {
    const autres = await db.get(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'pasteur_principal' AND id != ?", cible.id);
    if (!autres.n) {
      return res.status(400).json({
        error: 'Désignez d\'abord un autre Pasteur Principal avant de retirer ce rôle.',
      });
    }
  }

  await db.run('UPDATE users SET role = ?, tribu_id = ? WHERE id = ?',
    role, tribu_id ? Number(tribu_id) : null, cible.id);
  if (departement_ids !== undefined) await definirDepartements(cible.id, departement_ids);

  // Redevenu simple fidèle : les responsabilités portées sont libérées.
  if (role === 'fidele') {
    await db.run('UPDATE tribus SET patriarche_id = NULL WHERE patriarche_id = ?', cible.id);
    await db.run('UPDATE departements SET responsable_id = NULL WHERE responsable_id = ?', cible.id);
  }
  res.json({ ok: true });
});

/** DELETE /api/users/:id — suppression d'un compte (Pasteur Principal). */
router.delete('/:id', requireDirection, async (req, res) => {
  const cible = await controlerCible(req, res);
  if (!cible) return;
  if (cible.id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  }
  // Les responsabilités portées par ce compte sont libérées.
  await db.run('UPDATE tribus SET patriarche_id = NULL WHERE patriarche_id = ?', cible.id);
  await db.run('UPDATE departements SET responsable_id = NULL WHERE responsable_id = ?', cible.id);
  await db.run('DELETE FROM users WHERE id = ?', cible.id);
  res.json({ ok: true });
});

module.exports = router;
