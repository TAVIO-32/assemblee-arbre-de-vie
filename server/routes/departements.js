/**
 * routes/departements.js — Les 13 départements de l'assemblée.
 *
 * Symétrique des tribus : chaque département a un responsable qui gère ses
 * membres et leurs fiches de présence. Un fidèle peut servir dans PLUSIEURS
 * départements (table de liaison membres_departements).
 */
const express = require('express');
const db = require('../db');
const {
  requireAuth, requireDirection, peutAccederDepartement, COOKIE_NAME,
} = require('../middleware/auth');
const { CHAMPS_PUBLICS, JOINTURE_TRIBU } = require('../services/membres');

const router = express.Router();

const SELECT_DEPT = `
  SELECT d.id, d.nom, d.description, d.responsable_id,
    r.prenom AS responsable_prenom, r.nom AS responsable_nom,
    r.telephone AS responsable_telephone, r.whatsapp AS responsable_whatsapp,
    (SELECT COUNT(*) FROM membres_departements m
       JOIN users u ON u.id = m.membre_id
      WHERE m.departement_id = d.id AND u.statut = 'actif') AS nb_membres
  FROM departements d
  LEFT JOIN users r ON r.id = d.responsable_id`;

/** GET /api/departements — liste publique (affichée sur le formulaire d'inscription). */
router.get('/', async (req, res) => {
  const departements = await db.all(`${SELECT_DEPT} ORDER BY d.nom`);
  if (!req.cookies || !req.cookies[COOKIE_NAME]) {
    // Visiteur non connecté : uniquement les noms, pour le formulaire d'inscription.
    return res.json({ departements: departements.map((d) => ({ id: d.id, nom: d.nom, description: d.description })) });
  }
  res.json({ departements });
});

router.use(requireAuth);

/** GET /api/departements/:id — détail : membres du département et assiduité. */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const departement = await db.get(`${SELECT_DEPT} WHERE d.id = ?`, id);
  if (!departement) return res.status(404).json({ error: 'Département introuvable.' });

  const gere = peutAccederDepartement(req, id);
  const membreDuDept = await db.get(
    'SELECT 1 AS ok FROM membres_departements WHERE departement_id = ? AND membre_id = ?', id, req.user.id);
  if (!gere && !membreDuDept) {
    return res.status(403).json({ error: 'Ce département ne relève pas de votre périmètre.' });
  }

  const membres = (await db.all(`
    SELECT ${CHAMPS_PUBLICS},
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id) AS total_pointages,
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id AND p.statut = 'present') AS presents
    FROM users u ${JOINTURE_TRIBU}
    JOIN membres_departements m ON m.membre_id = u.id
    WHERE m.departement_id = ? AND u.statut = 'actif'
    ORDER BY u.nom, u.prenom
  `, id)).map((m) => ({
    ...m,
    taux_presence: m.total_pointages ? Math.round((m.presents / m.total_pointages) * 100) : null,
  }));

  res.json({ departement, geree: gere, membres });
});

/**
 * POST /api/departements/:id/membres — ajoute un fidèle au département.
 * Ouvert au responsable du département et au corps pastoral.
 */
router.post('/:id/membres', async (req, res) => {
  const id = Number(req.params.id);
  if (!peutAccederDepartement(req, id)) {
    return res.status(403).json({ error: 'Ce département ne relève pas de votre périmètre.' });
  }
  const membreId = Number(req.body?.membre_id);
  const membre = await db.get("SELECT id FROM users WHERE id = ? AND statut = 'actif'", membreId);
  if (!membre) return res.status(400).json({ error: 'Fidèle introuvable ou inactif.' });

  const existe = await db.get(
    'SELECT 1 AS ok FROM membres_departements WHERE membre_id = ? AND departement_id = ?', membreId, id);
  if (!existe) {
    await db.run('INSERT INTO membres_departements (membre_id, departement_id) VALUES (?, ?)', membreId, id);
  }
  res.status(201).json({ ok: true });
});

/** DELETE /api/departements/:id/membres/:membreId — retire un fidèle du département. */
router.delete('/:id/membres/:membreId', async (req, res) => {
  const id = Number(req.params.id);
  if (!peutAccederDepartement(req, id)) {
    return res.status(403).json({ error: 'Ce département ne relève pas de votre périmètre.' });
  }
  await db.run('DELETE FROM membres_departements WHERE membre_id = ? AND departement_id = ?',
    Number(req.params.membreId), id);
  res.json({ ok: true });
});

/* ----- Administration : corps pastoral ----- */

/** POST /api/departements/initialiser — (re)crée les départements officiels manquants. */
router.post('/initialiser', requireDirection, async (req, res) => {
  const ajouts = await db.amorcerReferentiel(true);
  res.json({ ok: true, ajouts: ajouts.departements });
});

/** POST /api/departements — création. */
router.post('/', requireDirection, async (req, res) => {
  const { nom, description } = req.body || {};
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  try {
    const id = await db.insert('INSERT INTO departements (nom, description) VALUES (?, ?)',
      String(nom).trim().toUpperCase(), String(description || '').trim());
    res.status(201).json({ id });
  } catch {
    res.status(409).json({ error: 'Un département porte déjà ce nom.' });
  }
});

/** PUT /api/departements/:id — nom, description et responsable. */
router.put('/:id', requireDirection, async (req, res) => {
  const { nom, description, responsable_id } = req.body || {};
  const departement = await db.get('SELECT * FROM departements WHERE id = ?', Number(req.params.id));
  if (!departement) return res.status(404).json({ error: 'Département introuvable.' });
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });

  let responsableId = null;
  if (responsable_id) {
    const membre = await db.get("SELECT * FROM users WHERE id = ? AND statut = 'actif'", Number(responsable_id));
    if (!membre) return res.status(400).json({ error: 'Le responsable désigné doit être un compte actif.' });
    responsableId = membre.id;
    if (membre.role === 'fidele') {
      await db.run("UPDATE users SET role = 'responsable_departement' WHERE id = ?", membre.id);
    }
    // Le responsable est nécessairement membre de son département.
    const dedans = await db.get(
      'SELECT 1 AS ok FROM membres_departements WHERE membre_id = ? AND departement_id = ?',
      membre.id, departement.id);
    if (!dedans) {
      await db.run('INSERT INTO membres_departements (membre_id, departement_id) VALUES (?, ?)',
        membre.id, departement.id);
    }
  }

  try {
    await db.run('UPDATE departements SET nom = ?, description = ?, responsable_id = ? WHERE id = ?',
      String(nom).trim().toUpperCase(), String(description || '').trim(), responsableId, departement.id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Un département porte déjà ce nom.' });
  }
});

/** DELETE /api/departements/:id — suppression (les fidèles restent, désaffectés). */
router.delete('/:id', requireDirection, async (req, res) => {
  await db.run('DELETE FROM departements WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
