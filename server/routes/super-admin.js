/**
 * routes/super-admin.js — Panel d'administration ZAURA.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setAdminCookie, clearAdminCookie, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

/** POST /api/admin/login */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
  const admin = await db.get('SELECT * FROM super_admins WHERE lower(email) = lower(?)', String(email).trim());
  if (!admin || !bcrypt.compareSync(String(password), admin.password_hash)) {
    if (req.app.recordFailedLogin) req.app.recordFailedLogin(req);
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }
  setAdminCookie(res, admin);
  res.json({ admin: { id: admin.id, email: admin.email, nom: admin.nom } });
});

/** POST /api/admin/logout */
router.post('/logout', (req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

/** GET /api/admin/me */
router.get('/me', requireSuperAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

/** GET /api/admin/organisations — Liste de toutes les eglises. */
router.get('/organisations', requireSuperAdmin, async (req, res) => {
  const orgs = await db.all(`
    SELECT o.*,
      (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.statut = 'actif') AS nb_membres
    FROM organisations o ORDER BY o.created_at DESC
  `);
  res.json({ organisations: orgs });
});

/** GET /api/admin/organisations/:id */
router.get('/organisations/:id', requireSuperAdmin, async (req, res) => {
  const org = await db.get('SELECT * FROM organisations WHERE id = ?', req.params.id);
  if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });
  const membres = await db.all(
    "SELECT id, nom, prenom, email, role, statut, created_at FROM users WHERE org_id = ? ORDER BY created_at DESC",
    org.id
  );
  const abonnements = await db.all(
    'SELECT * FROM abonnements WHERE org_id = ? ORDER BY created_at DESC',
    org.id
  );
  res.json({ organisation: org, membres, abonnements });
});

/** PUT /api/admin/organisations/:id — Modifier le statut d'une eglise. */
router.put('/organisations/:id', requireSuperAdmin, async (req, res) => {
  const { statut, plan } = req.body || {};
  const org = await db.get('SELECT * FROM organisations WHERE id = ?', req.params.id);
  if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });
  if (statut) await db.run('UPDATE organisations SET statut = ? WHERE id = ?', statut, org.id);
  if (plan) await db.run('UPDATE organisations SET plan = ? WHERE id = ?', plan, org.id);
  res.json({ ok: true });
});

/** POST /api/admin/organisations/:id/abonnement — Enregistrer un paiement. */
router.post('/organisations/:id/abonnement', requireSuperAdmin, async (req, res) => {
  const { plan, montant, moyen_paiement, reference_paiement, duree_mois } = req.body || {};
  const org = await db.get('SELECT * FROM organisations WHERE id = ?', req.params.id);
  if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });

  const debut = new Date();
  const fin = new Date();
  fin.setMonth(fin.getMonth() + (Number(duree_mois) || (plan === 'annuel' ? 12 : 1)));

  await db.insert(`
    INSERT INTO abonnements (org_id, plan, montant, moyen_paiement, reference_paiement, date_debut, date_fin, statut)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'actif')`,
    org.id, plan || 'mensuel', Number(montant) || 0,
    String(moyen_paiement || ''), String(reference_paiement || ''),
    debut.toISOString().split('T')[0], fin.toISOString().split('T')[0]
  );

  await db.run("UPDATE organisations SET statut = 'actif', plan = ? WHERE id = ?", plan || 'mensuel', org.id);
  res.json({ ok: true, message: 'Abonnement enregistre.' });
});

/** DELETE /api/admin/organisations/:id */
router.delete('/organisations/:id', requireSuperAdmin, async (req, res) => {
  await db.run('DELETE FROM organisations WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/** GET /api/admin/paiements-en-attente — Paiements a valider. */
router.get('/paiements-en-attente', requireSuperAdmin, async (req, res) => {
  const paiements = await db.all(`
    SELECT a.*, o.nom AS org_nom, o.slug AS org_slug
    FROM abonnements a
    JOIN organisations o ON o.id = a.org_id
    WHERE a.statut = 'en_attente'
    ORDER BY a.created_at DESC
  `);
  res.json({ paiements });
});

/** PUT /api/admin/paiements/:id/valider — Valider un paiement en attente. */
router.put('/paiements/:id/valider', requireSuperAdmin, async (req, res) => {
  const abo = await db.get('SELECT * FROM abonnements WHERE id = ?', req.params.id);
  if (!abo) return res.status(404).json({ error: 'Paiement introuvable.' });
  if (abo.statut !== 'en_attente') return res.status(400).json({ error: 'Ce paiement n\'est pas en attente.' });

  await db.run("UPDATE abonnements SET statut = 'actif' WHERE id = ?", abo.id);
  await db.run("UPDATE organisations SET statut = 'actif', plan = ? WHERE id = ?", abo.plan, abo.org_id);
  res.json({ ok: true, message: 'Paiement valide, eglise activee.' });
});

/** PUT /api/admin/paiements/:id/rejeter — Rejeter un paiement. */
router.put('/paiements/:id/rejeter', requireSuperAdmin, async (req, res) => {
  const abo = await db.get('SELECT * FROM abonnements WHERE id = ?', req.params.id);
  if (!abo) return res.status(404).json({ error: 'Paiement introuvable.' });

  await db.run("UPDATE abonnements SET statut = 'rejete' WHERE id = ?", abo.id);
  res.json({ ok: true, message: 'Paiement rejete.' });
});

/** GET /api/admin/stats — Statistiques globales de la plateforme. */
router.get('/stats', requireSuperAdmin, async (req, res) => {
  const total_orgs = (await db.get('SELECT COUNT(*) AS n FROM organisations')).n;
  const orgs_actives = (await db.get("SELECT COUNT(*) AS n FROM organisations WHERE statut = 'actif'")).n;
  const orgs_essai = (await db.get("SELECT COUNT(*) AS n FROM organisations WHERE statut = 'essai'")).n;
  const total_users = (await db.get('SELECT COUNT(*) AS n FROM users')).n;
  const users_actifs = (await db.get("SELECT COUNT(*) AS n FROM users WHERE statut = 'actif'")).n;
  res.json({ total_orgs, orgs_actives, orgs_essai, total_users, users_actifs });
});

module.exports = router;
