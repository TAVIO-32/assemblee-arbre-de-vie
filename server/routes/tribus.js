/**
 * routes/tribus.js — Les 6 tribus de l'assemblée.
 *
 * Chaque tribu est conduite par un patriarche qui dispose, sur SA tribu :
 *  - la liste de ses fidèles et leur assiduité ;
 *  - les fiches de présence (voir routes/evenements.js) ;
 *  - le tableau de bord de la tribu (voir routes/stats.js).
 * La création, la suppression et la désignation des patriarches relèvent du
 * corps pastoral.
 */
const express = require('express');
const db = require('../db');
const {
  requireAuth, requireDirection, peutAccederTribu,
} = require('../middleware/auth');
const { CHAMPS_PUBLICS, JOINTURE_TRIBU, avecDepartements } = require('../services/membres');

const router = express.Router();
router.use(requireAuth);

/** Requête commune : tribu + patriarche + effectif. */
const SELECT_TRIBU = `
  SELECT t.id, t.nom, t.description, t.patriarche_id,
    p.prenom AS patriarche_prenom, p.nom AS patriarche_nom,
    p.telephone AS patriarche_telephone, p.whatsapp AS patriarche_whatsapp,
    (SELECT COUNT(*) FROM users u WHERE u.tribu_id = t.id AND u.statut = 'actif') AS nb_membres
  FROM tribus t
  LEFT JOIN users p ON p.id = t.patriarche_id`;

/** GET /api/tribus — liste complète (lecture ouverte à tout compte actif). */
router.get('/', async (req, res) => {
  const tribus = await db.all(`${SELECT_TRIBU} ORDER BY t.nom`);
  res.json({
    tribus: tribus.map((t) => ({ ...t, geree: peutAccederTribu(req, t.id) })),
  });
});

/** GET /api/tribus/:id — détail : fidèles de la tribu et leur assiduité. */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const tribu = await db.get(`${SELECT_TRIBU} WHERE t.id = ?`, id);
  if (!tribu) return res.status(404).json({ error: 'Tribu introuvable.' });

  // Tout compte actif peut consulter la composition de SA propre tribu ;
  // le détail complet reste réservé au patriarche et au corps pastoral.
  const gere = peutAccederTribu(req, id);
  if (!gere && req.user.tribu_id !== id) {
    return res.status(403).json({ error: 'Cette tribu ne relève pas de votre périmètre.' });
  }

  const membres = await avecDepartements(await db.all(`
    SELECT ${CHAMPS_PUBLICS},
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id) AS total_pointages,
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id AND p.statut = 'present') AS presents
    FROM users u ${JOINTURE_TRIBU}
    WHERE u.tribu_id = ? AND u.statut = 'actif'
    ORDER BY u.nom, u.prenom
  `, id));

  res.json({
    tribu,
    geree: gere,
    membres: membres.map((m) => ({
      ...m,
      taux_presence: m.total_pointages ? Math.round((m.presents / m.total_pointages) * 100) : null,
    })),
  });
});

/* ----- Administration : corps pastoral ----- */

/** POST /api/tribus/initialiser — (re)crée les tribus officielles manquantes. */
router.post('/initialiser', requireDirection, async (req, res) => {
  const ajouts = await db.amorcerReferentiel(true);
  res.json({ ok: true, ajouts: ajouts.tribus });
});

/** POST /api/tribus — création d'une tribu. */
router.post('/', requireDirection, async (req, res) => {
  const { nom, description } = req.body || {};
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  try {
    const id = await db.insert('INSERT INTO tribus (nom, description) VALUES (?, ?)',
      String(nom).trim().toUpperCase(), String(description || '').trim());
    res.status(201).json({ id });
  } catch {
    res.status(409).json({ error: 'Une tribu porte déjà ce nom.' });
  }
});

/** PUT /api/tribus/:id — nom, description et patriarche. */
router.put('/:id', requireDirection, async (req, res) => {
  const { nom, description, patriarche_id } = req.body || {};
  const tribu = await db.get('SELECT * FROM tribus WHERE id = ?', Number(req.params.id));
  if (!tribu) return res.status(404).json({ error: 'Tribu introuvable.' });
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });

  let patriarcheId = null;
  if (patriarche_id) {
    const membre = await db.get("SELECT * FROM users WHERE id = ? AND statut = 'actif'", Number(patriarche_id));
    if (!membre) return res.status(400).json({ error: 'Le patriarche désigné doit être un compte actif.' });
    patriarcheId = membre.id;
    // Désigner quelqu'un patriarche lui en donne le rôle et le rattache à la tribu.
    if (membre.role === 'fidele' || membre.role === 'responsable_departement') {
      await db.run("UPDATE users SET role = 'patriarche' WHERE id = ?", membre.id);
    }
    if (!membre.tribu_id) {
      await db.run('UPDATE users SET tribu_id = ? WHERE id = ?', tribu.id, membre.id);
    }
  }

  try {
    await db.run('UPDATE tribus SET nom = ?, description = ?, patriarche_id = ? WHERE id = ?',
      String(nom).trim().toUpperCase(), String(description || '').trim(), patriarcheId, tribu.id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Une tribu porte déjà ce nom.' });
  }
});

/** DELETE /api/tribus/:id — suppression (les fidèles sont détachés, pas supprimés). */
router.delete('/:id', requireDirection, async (req, res) => {
  await db.run('DELETE FROM tribus WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
