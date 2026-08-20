/**
 * routes/annonces.js — Annonces WhatsApp des responsables (multi-tenant ZAURA).
 */
const express = require('express');
const db = require('../db');
const {
  requireAuth, requireEncadrement, filtreMembres,
  peutAccederTribu, peutAccederDepartement,
} = require('../middleware/auth');
const whatsapp = require('../services/whatsapp');

const router = express.Router();
router.use(requireAuth, requireEncadrement);

router.get('/', async (req, res) => {
  let sql = `
    SELECT a.*, u.prenom || ' ' || u.nom AS auteur,
           t.nom AS tribu_nom, d.nom AS departement_nom
    FROM annonces a
    LEFT JOIN users u ON u.id = a.auteur_id
    LEFT JOIN tribus t ON t.id = a.tribu_id
    LEFT JOIN departements d ON d.id = a.departement_id
    WHERE a.org_id = ?`;
  const params = [req.org_id];
  if (!req.perimetre.tout) {
    const morceaux = ['a.auteur_id = ?'];
    params.push(req.user.id);
    const { tribus, departements } = req.perimetre;
    if (tribus.length) {
      morceaux.push(`a.tribu_id IN (${db.placeholders(tribus.length)})`);
      params.push(...tribus);
    }
    if (departements.length) {
      morceaux.push(`a.departement_id IN (${db.placeholders(departements.length)})`);
      params.push(...departements);
    }
    sql += ` AND (${morceaux.join(' OR ')})`;
  }
  sql += ' ORDER BY a.id DESC LIMIT 100';
  res.json({ annonces: await db.all(sql, ...params) });
});

router.post('/', async (req, res) => {
  const { titre, contenu, cible } = req.body || {};
  const cibleId = req.body?.cible_id ? Number(req.body.cible_id) : null;
  if (!titre || !contenu) return res.status(400).json({ error: 'Titre et message obligatoires.' });

  let tribuId = null;
  let departementId = null;
  let sql = "SELECT id, nom, prenom, whatsapp, telephone FROM users u WHERE u.statut = 'actif' AND u.org_id = ?";
  const params = [req.org_id];

  if (cible === 'tribu') {
    if (!cibleId || !peutAccederTribu(req, cibleId)) {
      return res.status(403).json({ error: 'Cette tribu ne releve pas de votre perimetre.' });
    }
    tribuId = cibleId;
    sql += ' AND u.tribu_id = ?';
    params.push(cibleId);
  } else if (cible === 'departement') {
    if (!cibleId || !peutAccederDepartement(req, cibleId)) {
      return res.status(403).json({ error: 'Ce departement ne releve pas de votre perimetre.' });
    }
    departementId = cibleId;
    sql += ' AND u.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?)';
    params.push(cibleId);
  } else {
    const filtre = filtreMembres(req, 'u');
    if (filtre) { sql += ` AND ${filtre.sql}`; params.push(...filtre.params); }
  }

  const destinataires = await db.all(sql, ...params);
  const message = `📢 ${String(titre).trim()}\n\n${String(contenu).trim()}`;
  const envoi = whatsapp.preparerEnvoi(destinataires, message);

  await db.run(`
    INSERT INTO annonces (org_id, auteur_id, tribu_id, departement_id, titre, contenu, canal, nb_destinataires)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, req.org_id, req.user.id, tribuId, departementId, String(titre).trim(), String(contenu).trim(),
     envoi.canal, envoi.liens.length);

  res.status(201).json({ message, ...envoi });
});

module.exports = router;
