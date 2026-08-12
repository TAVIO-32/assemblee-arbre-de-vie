/**
 * routes/uploads.js — Upload de photos (profil, leaders) et du logo.
 *
 * Les images sont stockées dans data/uploads/ sous un nom unique.
 * Servies via GET /api/uploads/:nom.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireDirection } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TYPES_AUTORISES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TAILLE_MAX = 2 * 1024 * 1024; // 2 Mo

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: TAILLE_MAX },
  fileFilter: (req, file, cb) => {
    if (TYPES_AUTORISES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez JPG, PNG, WebP ou GIF.'));
  },
});

/** GET /api/uploads/:nom — sert une image uploadée. */
router.get('/:nom', (req, res) => {
  const nom = path.basename(req.params.nom);
  const fichier = path.join(UPLOAD_DIR, nom);
  if (!fs.existsSync(fichier)) return res.status(404).json({ error: 'Image introuvable.' });
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(fichier);
});

/**
 * POST /api/uploads/photo — upload de la photo de profil de l'utilisateur connecté.
 * Champ du formulaire : « photo ».
 */
router.post('/photo', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image reçue.' });
  const ancienne = await db.get('SELECT photo FROM users WHERE id = ?', req.user.id);
  if (ancienne && ancienne.photo) supprimerFichier(ancienne.photo);
  await db.run('UPDATE users SET photo = ? WHERE id = ?', req.file.filename, req.user.id);
  res.json({ ok: true, photo: req.file.filename });
});

/**
 * POST /api/uploads/photo/:id — un pasteur uploade la photo d'un fidèle.
 */
router.post('/photo/:id', requireAuth, requireDirection, upload.single('photo'), async (req, res) => {
  const id = Number(req.params.id);
  const user = await db.get('SELECT id, photo FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'Fidèle introuvable.' });
  if (!req.file) return res.status(400).json({ error: 'Aucune image reçue.' });
  if (user.photo) supprimerFichier(user.photo);
  await db.run('UPDATE users SET photo = ? WHERE id = ?', req.file.filename, id);
  res.json({ ok: true, photo: req.file.filename });
});

/** DELETE /api/uploads/photo — supprime sa propre photo. */
router.delete('/photo', requireAuth, async (req, res) => {
  const u = await db.get('SELECT photo FROM users WHERE id = ?', req.user.id);
  if (u && u.photo) supprimerFichier(u.photo);
  await db.run('UPDATE users SET photo = NULL WHERE id = ?', req.user.id);
  res.json({ ok: true });
});

/**
 * POST /api/uploads/logo — upload du logo de l'assemblée (corps pastoral).
 * Champ du formulaire : « logo ».
 */
router.post('/logo', requireAuth, requireDirection, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image reçue.' });
  const ancien = await db.get("SELECT valeur FROM parametres WHERE cle = 'logo'");
  if (ancien && ancien.valeur) supprimerFichier(ancien.valeur);
  await db.run(`
    INSERT INTO parametres (cle, valeur) VALUES ('logo', ?)
    ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur
  `, req.file.filename);
  res.json({ ok: true, logo: req.file.filename });
});

/** DELETE /api/uploads/logo — supprime le logo (retour au défaut). */
router.delete('/logo', requireAuth, requireDirection, async (req, res) => {
  const ancien = await db.get("SELECT valeur FROM parametres WHERE cle = 'logo'");
  if (ancien && ancien.valeur) supprimerFichier(ancien.valeur);
  await db.run("DELETE FROM parametres WHERE cle = 'logo'");
  res.json({ ok: true });
});

/** GET /api/uploads/logo — renvoie le fichier logo ou 404. */
router.get('/logo/current', async (req, res) => {
  const r = await db.get("SELECT valeur FROM parametres WHERE cle = 'logo'");
  if (!r || !r.valeur) return res.status(404).json({ error: 'Aucun logo.' });
  const fichier = path.join(UPLOAD_DIR, r.valeur);
  if (!fs.existsSync(fichier)) return res.status(404).json({ error: 'Fichier logo introuvable.' });
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(fichier);
});

function supprimerFichier(nom) {
  try { fs.unlinkSync(path.join(UPLOAD_DIR, nom)); } catch { /* ignoré */ }
}

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
