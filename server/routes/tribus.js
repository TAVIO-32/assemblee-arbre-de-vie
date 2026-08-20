/**
 * routes/tribus.js — Tribus (multi-tenant ZAURA).
 */
const express = require('express');
const db = require('../db');
const { requireAuth, requireDirection, peutAccederTribu } = require('../middleware/auth');
const { CHAMPS_PUBLICS, JOINTURE_TRIBU, avecDepartements } = require('../services/membres');
const { TRIBUS_DEFAUT } = require('../constants');

const router = express.Router();

const { COOKIE_NAME } = require('../middleware/auth');

const SELECT_TRIBU = `
  SELECT t.id, t.nom, t.description, t.patriarche_id,
    p.prenom AS patriarche_prenom, p.nom AS patriarche_nom,
    p.telephone AS patriarche_telephone, p.whatsapp AS patriarche_whatsapp,
    p.photo AS patriarche_photo,
    (SELECT COUNT(*) FROM users u WHERE u.tribu_id = t.id AND u.statut = 'actif') AS nb_membres
  FROM tribus t
  LEFT JOIN users p ON p.id = t.patriarche_id`;

router.get('/', async (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    const slug = req.query.slug;
    if (slug) {
      const org = await db.get('SELECT id, nom FROM organisations WHERE slug = ?', String(slug).toLowerCase());
      if (org) {
        const tribus = await db.all('SELECT id, nom, description FROM tribus WHERE org_id = ? ORDER BY nom', org.id);
        return res.json({ tribus, organisation: org.nom });
      }
    }
    return res.json({ tribus: [] });
  }
  return requireAuth(req, res, async () => {
    const tribus = await db.all(`${SELECT_TRIBU} WHERE t.org_id = ? ORDER BY t.nom`, req.org_id);
    res.json({ tribus: tribus.map((t) => ({ ...t, geree: peutAccederTribu(req, t.id) })) });
  });
});

router.use(requireAuth);

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const tribu = await db.get(`${SELECT_TRIBU} WHERE t.id = ? AND t.org_id = ?`, id, req.org_id);
  if (!tribu) return res.status(404).json({ error: 'Tribu introuvable.' });
  const gere = peutAccederTribu(req, id);
  if (!gere && req.user.tribu_id !== id) {
    return res.status(403).json({ error: 'Cette tribu ne releve pas de votre perimetre.' });
  }
  const membres = await avecDepartements(await db.all(`
    SELECT ${CHAMPS_PUBLICS},
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id) AS total_pointages,
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id AND p.statut = 'present') AS presents
    FROM users u ${JOINTURE_TRIBU}
    WHERE u.tribu_id = ? AND u.statut = 'actif' ORDER BY u.nom, u.prenom
  `, id));
  res.json({
    tribu, geree: gere,
    membres: membres.map((m) => ({
      ...m, taux_presence: m.total_pointages ? Math.round((m.presents / m.total_pointages) * 100) : null,
    })),
  });
});

router.post('/initialiser', requireDirection, async (req, res) => {
  const existantes = (await db.all('SELECT nom FROM tribus WHERE org_id = ?', req.org_id))
    .map((t) => t.nom.toUpperCase());
  let ajouts = 0;
  for (const nom of TRIBUS_DEFAUT) {
    if (!existantes.includes(nom.toUpperCase())) {
      await db.run('INSERT INTO tribus (org_id, nom) VALUES (?, ?)', req.org_id, nom);
      ajouts++;
    }
  }
  res.json({ ajouts });
});

router.post('/', requireDirection, async (req, res) => {
  const { nom, description } = req.body || {};
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  try {
    const id = await db.insert('INSERT INTO tribus (org_id, nom, description) VALUES (?, ?, ?)',
      req.org_id, String(nom).trim().toUpperCase(), String(description || '').trim());
    res.status(201).json({ id });
  } catch { res.status(409).json({ error: 'Une tribu porte deja ce nom.' }); }
});

router.put('/:id', requireDirection, async (req, res) => {
  const { nom, description, patriarche_id } = req.body || {};
  const tribu = await db.get('SELECT * FROM tribus WHERE id = ? AND org_id = ?', Number(req.params.id), req.org_id);
  if (!tribu) return res.status(404).json({ error: 'Tribu introuvable.' });
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  let patriarcheId = null;
  if (patriarche_id) {
    const membre = await db.get("SELECT * FROM users WHERE id = ? AND org_id = ? AND statut = 'actif'",
      Number(patriarche_id), req.org_id);
    if (!membre) return res.status(400).json({ error: 'Le patriarche designe doit etre un compte actif.' });
    patriarcheId = membre.id;
    if (membre.role === 'fidele' || membre.role === 'responsable_departement') {
      await db.run("UPDATE users SET role = 'patriarche' WHERE id = ?", membre.id);
    }
    if (!membre.tribu_id) await db.run('UPDATE users SET tribu_id = ? WHERE id = ?', tribu.id, membre.id);
  }
  try {
    await db.run('UPDATE tribus SET nom = ?, description = ?, patriarche_id = ? WHERE id = ?',
      String(nom).trim().toUpperCase(), String(description || '').trim(), patriarcheId, tribu.id);
    res.json({ ok: true });
  } catch { res.status(409).json({ error: 'Une tribu porte deja ce nom.' }); }
});

router.delete('/:id', requireDirection, async (req, res) => {
  await db.run('DELETE FROM tribus WHERE id = ? AND org_id = ?', Number(req.params.id), req.org_id);
  res.json({ ok: true });
});

module.exports = router;
