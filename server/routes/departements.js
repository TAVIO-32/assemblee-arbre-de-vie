/**
 * routes/departements.js — Departements (multi-tenant ZAURA).
 */
const express = require('express');
const db = require('../db');
const { requireAuth, requireDirection, peutAccederDepartement, COOKIE_NAME } = require('../middleware/auth');
const { CHAMPS_PUBLICS, JOINTURE_TRIBU } = require('../services/membres');
const { DEPARTEMENTS_DEFAUT } = require('../constants');

const router = express.Router();

const SELECT_DEPT = `
  SELECT d.id, d.nom, d.description, d.responsable_id,
    r.prenom AS responsable_prenom, r.nom AS responsable_nom,
    r.telephone AS responsable_telephone, r.whatsapp AS responsable_whatsapp,
    r.photo AS responsable_photo,
    (SELECT COUNT(*) FROM membres_departements m
       JOIN users u ON u.id = m.membre_id
      WHERE m.departement_id = d.id AND u.statut = 'actif') AS nb_membres
  FROM departements d
  LEFT JOIN users r ON r.id = d.responsable_id`;

router.get('/', async (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    const slug = req.query.slug;
    if (slug) {
      const org = await db.get('SELECT id FROM organisations WHERE slug = ?', String(slug).toLowerCase());
      if (org) {
        const departements = await db.all('SELECT id, nom, description FROM departements WHERE org_id = ? ORDER BY nom', org.id);
        return res.json({ departements });
      }
    }
    return res.json({ departements: [] });
  }
  return requireAuth(req, res, async () => {
    const departements = await db.all(`${SELECT_DEPT} WHERE d.org_id = ? ORDER BY d.nom`, req.org_id);
    res.json({ departements });
  });
});

router.use(requireAuth);

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const departement = await db.get(`${SELECT_DEPT} WHERE d.id = ? AND d.org_id = ?`, id, req.org_id);
  if (!departement) return res.status(404).json({ error: 'Departement introuvable.' });
  const gere = peutAccederDepartement(req, id);
  const membreDuDept = await db.get(
    'SELECT 1 AS ok FROM membres_departements WHERE departement_id = ? AND membre_id = ?', id, req.user.id);
  if (!gere && !membreDuDept) return res.status(403).json({ error: 'Acces refuse.' });
  const membres = (await db.all(`
    SELECT ${CHAMPS_PUBLICS},
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id) AS total_pointages,
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id AND p.statut = 'present') AS presents
    FROM users u ${JOINTURE_TRIBU}
    JOIN membres_departements m ON m.membre_id = u.id
    WHERE m.departement_id = ? AND u.statut = 'actif' ORDER BY u.nom, u.prenom
  `, id)).map((m) => ({
    ...m, taux_presence: m.total_pointages ? Math.round((m.presents / m.total_pointages) * 100) : null,
  }));
  res.json({ departement, geree: gere, membres });
});

router.post('/:id/membres', async (req, res) => {
  const id = Number(req.params.id);
  if (!peutAccederDepartement(req, id)) return res.status(403).json({ error: 'Acces refuse.' });
  const membreId = Number(req.body?.membre_id);
  const membre = await db.get("SELECT id FROM users WHERE id = ? AND org_id = ? AND statut = 'actif'", membreId, req.org_id);
  if (!membre) return res.status(400).json({ error: 'Fidele introuvable ou inactif.' });
  const existe = await db.get(
    'SELECT 1 AS ok FROM membres_departements WHERE membre_id = ? AND departement_id = ?', membreId, id);
  if (!existe) await db.run('INSERT INTO membres_departements (membre_id, departement_id) VALUES (?, ?)', membreId, id);
  res.status(201).json({ ok: true });
});

router.delete('/:id/membres/:membreId', async (req, res) => {
  const id = Number(req.params.id);
  if (!peutAccederDepartement(req, id)) return res.status(403).json({ error: 'Acces refuse.' });
  await db.run('DELETE FROM membres_departements WHERE membre_id = ? AND departement_id = ?',
    Number(req.params.membreId), id);
  res.json({ ok: true });
});

router.post('/initialiser', requireDirection, async (req, res) => {
  const existants = (await db.all('SELECT nom FROM departements WHERE org_id = ?', req.org_id))
    .map((d) => d.nom.toUpperCase());
  let ajouts = 0;
  for (const nom of DEPARTEMENTS_DEFAUT) {
    if (!existants.includes(nom.toUpperCase())) {
      await db.run('INSERT INTO departements (org_id, nom) VALUES (?, ?)', req.org_id, nom);
      ajouts++;
    }
  }
  res.json({ ajouts });
});

router.post('/', requireDirection, async (req, res) => {
  const { nom, description } = req.body || {};
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  try {
    const id = await db.insert('INSERT INTO departements (org_id, nom, description) VALUES (?, ?, ?)',
      req.org_id, String(nom).trim().toUpperCase(), String(description || '').trim());
    res.status(201).json({ id });
  } catch { res.status(409).json({ error: 'Un departement porte deja ce nom.' }); }
});

router.put('/:id', requireDirection, async (req, res) => {
  const { nom, description, responsable_id } = req.body || {};
  const departement = await db.get('SELECT * FROM departements WHERE id = ? AND org_id = ?', Number(req.params.id), req.org_id);
  if (!departement) return res.status(404).json({ error: 'Departement introuvable.' });
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  let responsableId = null;
  if (responsable_id) {
    const membre = await db.get("SELECT * FROM users WHERE id = ? AND org_id = ? AND statut = 'actif'",
      Number(responsable_id), req.org_id);
    if (!membre) return res.status(400).json({ error: 'Le responsable doit etre un compte actif.' });
    responsableId = membre.id;
    if (membre.role === 'fidele') await db.run("UPDATE users SET role = 'responsable_departement' WHERE id = ?", membre.id);
    const dedans = await db.get(
      'SELECT 1 AS ok FROM membres_departements WHERE membre_id = ? AND departement_id = ?', membre.id, departement.id);
    if (!dedans) await db.run('INSERT INTO membres_departements (membre_id, departement_id) VALUES (?, ?)', membre.id, departement.id);
  }
  try {
    await db.run('UPDATE departements SET nom = ?, description = ?, responsable_id = ? WHERE id = ?',
      String(nom).trim().toUpperCase(), String(description || '').trim(), responsableId, departement.id);
    res.json({ ok: true });
  } catch { res.status(409).json({ error: 'Un departement porte deja ce nom.' }); }
});

router.delete('/:id', requireDirection, async (req, res) => {
  await db.run('DELETE FROM departements WHERE id = ? AND org_id = ?', Number(req.params.id), req.org_id);
  res.json({ ok: true });
});

module.exports = router;
