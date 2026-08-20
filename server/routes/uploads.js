/**
 * routes/uploads.js — Upload de photos et logo (multi-tenant ZAURA).
 */
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const db = require('../db');
const { requireAuth, requireDirection } = require('../middleware/auth');

const router = express.Router();

const TYPES_AUTORISES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TAILLE_MAX = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX },
  fileFilter: (req, file, cb) => {
    if (TYPES_AUTORISES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporte. Utilisez JPG, PNG, WebP ou GIF.'));
  },
});

async function sauvegarderFichier(orgId, buffer, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase() || '.jpg';
  const nom = crypto.randomBytes(12).toString('hex') + ext;
  await db.run(
    'INSERT INTO fichiers (org_id, nom, mime, donnees) VALUES (?, ?, ?, ?)',
    orgId, nom, mimetype, buffer,
  );
  return nom;
}

async function supprimerFichier(orgId, nom) {
  if (nom) await db.run('DELETE FROM fichiers WHERE org_id = ? AND nom = ?', orgId, nom);
}

router.get('/:nom', async (req, res) => {
  const nom = path.basename(req.params.nom);
  const row = await db.get('SELECT mime, donnees FROM fichiers WHERE nom = ?', nom);
  if (!row) return res.status(404).json({ error: 'Image introuvable.' });
  res.set('Content-Type', row.mime);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(Buffer.isBuffer(row.donnees) ? row.donnees : Buffer.from(row.donnees));
});

router.post('/photo', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image recue.' });
  const ancienne = await db.get('SELECT photo FROM users WHERE id = ?', req.user.id);
  if (ancienne && ancienne.photo) await supprimerFichier(req.org_id, ancienne.photo);
  const nom = await sauvegarderFichier(req.org_id, req.file.buffer, req.file.mimetype, req.file.originalname);
  await db.run('UPDATE users SET photo = ? WHERE id = ?', nom, req.user.id);
  res.json({ ok: true, photo: nom });
});

router.post('/photo/:id', requireAuth, requireDirection, upload.single('photo'), async (req, res) => {
  const id = Number(req.params.id);
  const user = await db.get('SELECT id, photo FROM users WHERE id = ? AND org_id = ?', id, req.org_id);
  if (!user) return res.status(404).json({ error: 'Fidele introuvable.' });
  if (!req.file) return res.status(400).json({ error: 'Aucune image recue.' });
  if (user.photo) await supprimerFichier(req.org_id, user.photo);
  const nom = await sauvegarderFichier(req.org_id, req.file.buffer, req.file.mimetype, req.file.originalname);
  await db.run('UPDATE users SET photo = ? WHERE id = ?', nom, id);
  res.json({ ok: true, photo: nom });
});

router.delete('/photo', requireAuth, async (req, res) => {
  const u = await db.get('SELECT photo FROM users WHERE id = ?', req.user.id);
  if (u && u.photo) await supprimerFichier(req.org_id, u.photo);
  await db.run('UPDATE users SET photo = NULL WHERE id = ?', req.user.id);
  res.json({ ok: true });
});

router.post('/logo', requireAuth, requireDirection, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image recue.' });
  const ancien = await db.get("SELECT valeur FROM parametres WHERE org_id = ? AND cle = 'logo'", req.org_id);
  if (ancien && ancien.valeur) await supprimerFichier(req.org_id, ancien.valeur);
  const nom = await sauvegarderFichier(req.org_id, req.file.buffer, req.file.mimetype, req.file.originalname);
  await db.run(`
    INSERT INTO parametres (org_id, cle, valeur) VALUES (?, 'logo', ?)
    ON CONFLICT (org_id, cle) DO UPDATE SET valeur = EXCLUDED.valeur
  `, req.org_id, nom);
  res.json({ ok: true, logo: nom });
});

router.delete('/logo', requireAuth, requireDirection, async (req, res) => {
  const ancien = await db.get("SELECT valeur FROM parametres WHERE org_id = ? AND cle = 'logo'", req.org_id);
  if (ancien && ancien.valeur) await supprimerFichier(req.org_id, ancien.valeur);
  await db.run("DELETE FROM parametres WHERE org_id = ? AND cle = 'logo'", req.org_id);
  res.json({ ok: true });
});

router.get('/logo/current', async (req, res) => {
  const { COOKIE_NAME } = require('../middleware/auth');
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || '';
  let orgId = null;

  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      orgId = payload.org_id;
    } catch {}
  }
  if (!orgId && req.query.slug) {
    const org = await db.get('SELECT id FROM organisations WHERE slug = ?', String(req.query.slug).toLowerCase());
    if (org) orgId = org.id;
  }
  if (!orgId) return res.status(404).json({ error: 'Aucun logo.' });

  const r = await db.get("SELECT valeur FROM parametres WHERE org_id = ? AND cle = 'logo'", orgId);
  if (!r || !r.valeur) return res.status(404).json({ error: 'Aucun logo.' });
  const row = await db.get('SELECT mime, donnees FROM fichiers WHERE org_id = ? AND nom = ?', orgId, r.valeur);
  if (!row) return res.status(404).json({ error: 'Fichier logo introuvable.' });
  res.set('Content-Type', row.mime);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(Buffer.isBuffer(row.donnees) ? row.donnees : Buffer.from(row.donnees));
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image trop lourde (2 Mo maximum).' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
