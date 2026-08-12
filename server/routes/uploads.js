/**
 * routes/uploads.js — Upload de photos (profil, leaders) et du logo.
 *
 * Les images sont stockées dans la table « fichiers » (BLOB/BYTEA) pour
 * persister sans disque dédié (Render free tier, etc.).
 * Servies via GET /api/uploads/:nom.
 */
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const db = require('../db');
const { requireAuth, requireDirection } = require('../middleware/auth');

const router = express.Router();

const TYPES_AUTORISES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TAILLE_MAX = 2 * 1024 * 1024; // 2 Mo

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX },
  fileFilter: (req, file, cb) => {
    if (TYPES_AUTORISES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez JPG, PNG, WebP ou GIF.'));
  },
});

async function sauvegarderFichier(buffer, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase() || '.jpg';
  const nom = crypto.randomBytes(12).toString('hex') + ext;
  await db.run(
    'INSERT INTO fichiers (nom, mime, donnees) VALUES (?, ?, ?)',
    nom, mimetype, buffer,
  );
  return nom;
}

async function supprimerFichier(nom) {
  if (nom) await db.run('DELETE FROM fichiers WHERE nom = ?', nom);
}

/** GET /api/uploads/:nom — sert une image depuis la base. */
router.get('/:nom', async (req, res) => {
  const nom = path.basename(req.params.nom);
  const row = await db.get('SELECT mime, donnees FROM fichiers WHERE nom = ?', nom);
  if (!row) return res.status(404).json({ error: 'Image introuvable.' });
  res.set('Content-Type', row.mime);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(Buffer.isBuffer(row.donnees) ? row.donnees : Buffer.from(row.donnees));
});

/**
 * POST /api/uploads/photo — upload de la photo de profil de l'utilisateur connecté.
 */
router.post('/photo', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image reçue.' });
  const ancienne = await db.get('SELECT photo FROM users WHERE id = ?', req.user.id);
  if (ancienne && ancienne.photo) await supprimerFichier(ancienne.photo);
  const nom = await sauvegarderFichier(req.file.buffer, req.file.mimetype, req.file.originalname);
  await db.run('UPDATE users SET photo = ? WHERE id = ?', nom, req.user.id);
  res.json({ ok: true, photo: nom });
});

/**
 * POST /api/uploads/photo/:id — un pasteur uploade la photo d'un fidèle.
 */
router.post('/photo/:id', requireAuth, requireDirection, upload.single('photo'), async (req, res) => {
  const id = Number(req.params.id);
  const user = await db.get('SELECT id, photo FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'Fidèle introuvable.' });
  if (!req.file) return res.status(400).json({ error: 'Aucune image reçue.' });
  if (user.photo) await supprimerFichier(user.photo);
  const nom = await sauvegarderFichier(req.file.buffer, req.file.mimetype, req.file.originalname);
  await db.run('UPDATE users SET photo = ? WHERE id = ?', nom, id);
  res.json({ ok: true, photo: nom });
});

/** DELETE /api/uploads/photo — supprime sa propre photo. */
router.delete('/photo', requireAuth, async (req, res) => {
  const u = await db.get('SELECT photo FROM users WHERE id = ?', req.user.id);
  if (u && u.photo) await supprimerFichier(u.photo);
  await db.run('UPDATE users SET photo = NULL WHERE id = ?', req.user.id);
  res.json({ ok: true });
});

/**
 * POST /api/uploads/logo — upload du logo de l'assemblée (corps pastoral).
 */
router.post('/logo', requireAuth, requireDirection, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image reçue.' });
  const ancien = await db.get("SELECT valeur FROM parametres WHERE cle = 'logo'");
  if (ancien && ancien.valeur) await supprimerFichier(ancien.valeur);
  const nom = await sauvegarderFichier(req.file.buffer, req.file.mimetype, req.file.originalname);
  await db.run(`
    INSERT INTO parametres (cle, valeur) VALUES ('logo', ?)
    ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur
  `, nom);
  res.json({ ok: true, logo: nom });
});

/** DELETE /api/uploads/logo — supprime le logo (retour au défaut). */
router.delete('/logo', requireAuth, requireDirection, async (req, res) => {
  const ancien = await db.get("SELECT valeur FROM parametres WHERE cle = 'logo'");
  if (ancien && ancien.valeur) await supprimerFichier(ancien.valeur);
  await db.run("DELETE FROM parametres WHERE cle = 'logo'");
  res.json({ ok: true });
});

/** GET /api/uploads/logo/current — renvoie le fichier logo ou 404. */
router.get('/logo/current', async (req, res) => {
  const r = await db.get("SELECT valeur FROM parametres WHERE cle = 'logo'");
  if (!r || !r.valeur) return res.status(404).json({ error: 'Aucun logo.' });
  const row = await db.get('SELECT mime, donnees FROM fichiers WHERE nom = ?', r.valeur);
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
