/**
 * routes/stats.js — Tableaux de bord et statistiques (multi-tenant ZAURA).
 */
const express = require('express');
const db = require('../db');
const { ROLES, CODES_ROLES } = require('../constants');
const {
  requireAuth, requireDirection, peutAccederTribu, peutAccederDepartement,
} = require('../middleware/auth');
const { assiduite } = require('../services/membres');

const router = express.Router();
router.use(requireAuth);

const SEUIL_ABSENCES = 3;

async function tauxPresence(where, params = []) {
  const r = await db.get(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN p.statut = 'present' THEN 1 ELSE 0 END) AS presents,
           SUM(CASE WHEN p.statut = 'absent'  THEN 1 ELSE 0 END) AS absents,
           SUM(CASE WHEN p.statut = 'excuse'  THEN 1 ELSE 0 END) AS excuses
    FROM presences p
    JOIN evenements e ON e.id = p.evenement_id
    JOIN users u ON u.id = p.membre_id
    ${where}
  `, ...params);
  const total = r.total || 0;
  return {
    total,
    presents: r.presents || 0,
    absents: r.absents || 0,
    excuses: r.excuses || 0,
    taux: total ? Math.round(((r.presents || 0) / total) * 100) : null,
  };
}

async function evolutionMensuelle(where, params = []) {
  const lignes = await db.all(`
    SELECT substr(e.date, 1, 7) AS mois,
           COUNT(*) AS total,
           SUM(CASE WHEN p.statut = 'present' THEN 1 ELSE 0 END) AS presents
    FROM presences p
    JOIN evenements e ON e.id = p.evenement_id
    JOIN users u ON u.id = p.membre_id
    ${where}
    GROUP BY substr(e.date, 1, 7)
    ORDER BY mois DESC
    LIMIT 12
  `, ...params);
  return lignes
    .map((l) => ({
      mois: l.mois,
      total: l.total,
      presents: l.presents || 0,
      taux: l.total ? Math.round(((l.presents || 0) / l.total) * 100) : 0,
    }))
    .reverse();
}

async function assiduiteMembres(where, params = []) {
  const membres = await db.all(`
    SELECT u.id, u.nom, u.prenom, u.role, u.telephone, u.whatsapp,
           u.tribu_id, t.nom AS tribu_nom,
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id) AS total,
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id AND p.statut = 'present') AS presents,
      (SELECT COUNT(*) FROM presences p WHERE p.membre_id = u.id AND p.statut = 'absent') AS absents
    FROM users u
    LEFT JOIN tribus t ON t.id = u.tribu_id
    ${where}
    ORDER BY u.nom, u.prenom
  `, ...params);
  return membres.map((m) => ({
    ...m,
    taux_presence: m.total ? Math.round((m.presents / m.total) * 100) : null,
  }));
}

async function membresEnAlerte(clause = '', params = []) {
  const lignes = await db.all(`
    SELECT p.membre_id, p.statut, u.nom, u.prenom, u.whatsapp, u.telephone,
           u.tribu_id, t.nom AS tribu_nom
    FROM presences p
    JOIN evenements e ON e.id = p.evenement_id
    JOIN users u ON u.id = p.membre_id
    LEFT JOIN tribus t ON t.id = u.tribu_id
    WHERE u.statut = 'actif' ${clause}
    ORDER BY e.date DESC, e.id DESC
  `, ...params);

  const parMembre = new Map();
  for (const ligne of lignes) {
    if (!parMembre.has(ligne.membre_id)) parMembre.set(ligne.membre_id, { infos: ligne, statuts: [] });
    const m = parMembre.get(ligne.membre_id);
    if (m.statuts.length < SEUIL_ABSENCES) m.statuts.push(ligne.statut);
  }

  const alertes = [];
  for (const { infos, statuts } of parMembre.values()) {
    if (statuts.length === SEUIL_ABSENCES && statuts.every((s) => s === 'absent')) {
      alertes.push({
        membre_id: infos.membre_id, nom: infos.nom, prenom: infos.prenom,
        whatsapp: infos.whatsapp, telephone: infos.telephone,
        tribu_nom: infos.tribu_nom, absences_consecutives: SEUIL_ABSENCES,
      });
    }
  }
  return alertes;
}

router.get('/global', requireDirection, async (req, res) => {
  const oid = req.org_id;
  const effectifs = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE org_id = ? AND statut = 'actif')        AS fideles_actifs,
      (SELECT COUNT(*) FROM users WHERE org_id = ? AND statut = 'en_attente')   AS comptes_en_attente,
      (SELECT COUNT(*) FROM users WHERE org_id = ? AND statut = 'actif' AND tribu_id IS NULL) AS sans_tribu,
      (SELECT COUNT(*) FROM tribus WHERE org_id = ?)                            AS tribus,
      (SELECT COUNT(*) FROM departements WHERE org_id = ?)                      AS departements,
      (SELECT COUNT(*) FROM evenements WHERE org_id = ?)                        AS evenements,
      (SELECT COUNT(*) FROM presences p JOIN evenements e ON e.id = p.evenement_id WHERE e.org_id = ?) AS pointages,
      (SELECT COUNT(*) FROM demandes WHERE org_id = ? AND statut = 'nouveau')   AS demandes_nouvelles,
      (SELECT COUNT(*) FROM fiches_membres WHERE org_id = ?)                    AS fiches_qr,
      (SELECT COUNT(DISTINCT m.membre_id) FROM membres_departements m
        JOIN users u ON u.id = m.membre_id WHERE u.org_id = ? AND u.statut = 'actif') AS serviteurs,
      (SELECT COUNT(*) FROM users u2 WHERE u2.org_id = ? AND u2.statut = 'actif'
        AND u2.id NOT IN (SELECT membre_id FROM membres_departements)) AS fideles_simples
  `, oid, oid, oid, oid, oid, oid, oid, oid, oid, oid, oid);

  const comptesRoles = await db.all(
    "SELECT role, COUNT(*) AS nb FROM users WHERE org_id = ? AND statut = 'actif' GROUP BY role", oid);
  const parRole = CODES_ROLES.map((code) => ({
    role: code,
    libelle: ROLES[code].libelle,
    niveau: ROLES[code].niveau,
    nb: (comptesRoles.find((c) => c.role === code) || { nb: 0 }).nb,
  }));

  const tribus = await db.all(`
    SELECT t.id, t.nom, t.patriarche_id,
      p.prenom AS patriarche_prenom, p.nom AS patriarche_nom, p.photo AS patriarche_photo,
      (SELECT COUNT(*) FROM users u WHERE u.tribu_id = t.id AND u.statut = 'actif') AS nb_membres
    FROM tribus t LEFT JOIN users p ON p.id = t.patriarche_id
    WHERE t.org_id = ? ORDER BY t.nom`, oid);
  const parTribu = [];
  for (const t of tribus) {
    const stats = await tauxPresence('WHERE u.tribu_id = ? AND u.org_id = ?', [t.id, oid]);
    parTribu.push({ ...t, ...stats, taux_presence: stats.taux });
  }

  const departements = await db.all(`
    SELECT d.id, d.nom, d.responsable_id,
      r.prenom AS responsable_prenom, r.nom AS responsable_nom, r.photo AS responsable_photo,
      (SELECT COUNT(*) FROM membres_departements m JOIN users u ON u.id = m.membre_id
        WHERE m.departement_id = d.id AND u.statut = 'actif') AS nb_membres
    FROM departements d LEFT JOIN users r ON r.id = d.responsable_id
    WHERE d.org_id = ? ORDER BY d.nom`, oid);
  const parDepartement = [];
  for (const d of departements) {
    const stats = await tauxPresence(
      'WHERE u.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?) AND u.org_id = ?', [d.id, oid]);
    parDepartement.push({ ...d, ...stats, taux_presence: stats.taux });
  }

  const presenceGlobale = await tauxPresence('WHERE u.org_id = ?', [oid]);
  const membres = await assiduiteMembres("WHERE u.org_id = ? AND u.statut = 'actif'", [oid]);
  const classes = membres.filter((m) => m.total >= 3).sort((a, b) => b.taux_presence - a.taux_presence);
  const plusAssidus = classes.slice(0, 5);
  const dejaCites = new Set(plusAssidus.map((m) => m.id));
  const moinsAssidus = classes.slice().reverse().filter((m) => !dejaCites.has(m.id)).slice(0, 5);

  const fichesParTribu = await db.all(`
    SELECT tribu AS nom, COUNT(*) AS nb FROM fiches_membres
    WHERE org_id = ? AND tribu != '' GROUP BY tribu`, oid);
  const fichesParDept = await db.all(`
    SELECT departement AS nom, COUNT(*) AS nb FROM fiches_membres
    WHERE org_id = ? AND departement != '' GROUP BY departement`, oid);
  for (const t of parTribu) {
    const f = fichesParTribu.find((x) => x.nom === t.nom);
    t.nb_fiches_qr = f ? f.nb : 0;
  }
  for (const d of parDepartement) {
    const f = fichesParDept.find((x) => x.nom === d.nom);
    d.nb_fiches_qr = f ? f.nb : 0;
  }

  const comptages = await db.get(`
    SELECT COALESCE(SUM(hommes), 0) AS total_hommes,
           COALESCE(SUM(femmes), 0) AS total_femmes,
           COALESCE(SUM(enfants), 0) AS total_enfants,
           COUNT(*) AS nb_comptages
    FROM comptages c JOIN evenements e ON e.id = c.evenement_id WHERE e.org_id = ?
  `, oid);

  res.json({
    effectifs,
    presence: presenceGlobale,
    taux_presence_global: presenceGlobale.taux,
    par_role: parRole,
    par_tribu: parTribu,
    par_departement: parDepartement,
    evolution: await evolutionMensuelle('WHERE u.org_id = ?', [oid]),
    plus_assidus: plusAssidus,
    moins_assidus: moinsAssidus,
    alertes_absences: await membresEnAlerte('AND u.org_id = ?', [oid]),
    comptages,
  });
});

router.get('/tribu/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!peutAccederTribu(req, id)) {
    return res.status(403).json({ error: 'Cette tribu ne releve pas de votre perimetre.' });
  }
  const tribu = await db.get(`
    SELECT t.*, p.prenom AS patriarche_prenom, p.nom AS patriarche_nom, p.photo AS patriarche_photo
    FROM tribus t LEFT JOIN users p ON p.id = t.patriarche_id WHERE t.id = ? AND t.org_id = ?`, id, req.org_id);
  if (!tribu) return res.status(404).json({ error: 'Tribu introuvable.' });

  const oid = req.org_id;
  const presence = await tauxPresence('WHERE u.tribu_id = ? AND u.org_id = ?', [id, oid]);
  const presenceActivites = await tauxPresence('WHERE u.tribu_id = ? AND e.tribu_id = ? AND u.org_id = ?', [id, id, oid]);
  const membres = await assiduiteMembres("WHERE u.tribu_id = ? AND u.statut = 'actif' AND u.org_id = ?", [id, oid]);

  const evenements = await db.all(`
    SELECT e.id, e.titre, e.type, e.date, e.portee,
      (SELECT COUNT(*) FROM presences p JOIN users u ON u.id = p.membre_id
        WHERE p.evenement_id = e.id AND u.tribu_id = ?) AS nb_pointes,
      (SELECT COUNT(*) FROM presences p JOIN users u ON u.id = p.membre_id
        WHERE p.evenement_id = e.id AND u.tribu_id = ? AND p.statut = 'present') AS nb_presents,
      c.hommes AS comptage_hommes, c.femmes AS comptage_femmes, c.enfants AS comptage_enfants
    FROM evenements e
    LEFT JOIN comptages c ON c.evenement_id = e.id
    WHERE e.org_id = ? AND (e.portee = 'assemblee' OR e.tribu_id = ?)
    ORDER BY e.date DESC, e.id DESC LIMIT 10
  `, id, id, oid, id);

  res.json({
    tribu,
    presence,
    presence_activites: presenceActivites,
    taux_presence: presence.taux,
    nb_membres: membres.length,
    membres,
    evenements,
    evolution: await evolutionMensuelle('WHERE u.tribu_id = ? AND u.org_id = ?', [id, oid]),
    alertes_absences: await membresEnAlerte('AND u.tribu_id = ? AND u.org_id = ?', [id, oid]),
  });
});

router.get('/departement/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!peutAccederDepartement(req, id)) {
    return res.status(403).json({ error: 'Ce departement ne releve pas de votre perimetre.' });
  }
  const departement = await db.get(`
    SELECT d.*, r.prenom AS responsable_prenom, r.nom AS responsable_nom, r.photo AS responsable_photo
    FROM departements d LEFT JOIN users r ON r.id = d.responsable_id WHERE d.id = ? AND d.org_id = ?`, id, req.org_id);
  if (!departement) return res.status(404).json({ error: 'Departement introuvable.' });

  const oid = req.org_id;
  const appartenance = 'u.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?)';
  const presence = await tauxPresence(`WHERE ${appartenance} AND u.org_id = ?`, [id, oid]);
  const presenceActivites = await tauxPresence(`WHERE ${appartenance} AND e.departement_id = ? AND u.org_id = ?`, [id, id, oid]);
  const membres = await assiduiteMembres(`WHERE ${appartenance} AND u.statut = 'actif' AND u.org_id = ?`, [id, oid]);

  const evenements = await db.all(`
    SELECT e.id, e.titre, e.type, e.date, e.portee,
      (SELECT COUNT(*) FROM presences p WHERE p.evenement_id = e.id) AS nb_pointes,
      (SELECT COUNT(*) FROM presences p WHERE p.evenement_id = e.id AND p.statut = 'present') AS nb_presents,
      c.hommes AS comptage_hommes, c.femmes AS comptage_femmes, c.enfants AS comptage_enfants
    FROM evenements e
    LEFT JOIN comptages c ON c.evenement_id = e.id
    WHERE e.departement_id = ? AND e.org_id = ?
    ORDER BY e.date DESC, e.id DESC LIMIT 10
  `, id, oid);

  res.json({
    departement,
    presence,
    presence_activites: presenceActivites,
    taux_presence: presence.taux,
    nb_membres: membres.length,
    membres,
    evenements,
    evolution: await evolutionMensuelle(`WHERE ${appartenance} AND u.org_id = ?`, [id, oid]),
    alertes_absences: await membresEnAlerte(`AND ${appartenance} AND u.org_id = ?`, [id, oid]),
  });
});

router.post('/bilan', requireDirection, async (req, res) => {
  const oid = req.org_id;
  const maintenant = new Date();
  const mois = String(req.body?.mois || '').slice(0, 7) ||
    `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}$/.test(mois)) {
    return res.status(400).json({ error: 'Format attendu : AAAA-MM.' });
  }

  const dateDebut = mois + '-01';
  const moisSuivant = Number(mois.split('-')[1]) === 12
    ? `${Number(mois.split('-')[0]) + 1}-01`
    : `${mois.split('-')[0]}-${String(Number(mois.split('-')[1]) + 1).padStart(2, '0')}`;
  const dateFin = moisSuivant + '-01';

  const effectifs = await db.get(
    "SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND statut = 'actif'", oid);

  const nouveaux = await db.get(
    "SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND statut = 'actif' AND created_at >= ? AND created_at < ?",
    oid, dateDebut, dateFin);

  const evenements = await db.get(
    'SELECT COUNT(*) AS n FROM evenements WHERE org_id = ? AND date >= ? AND date < ?',
    oid, dateDebut, dateFin);

  const cultes = await db.get(
    "SELECT COUNT(*) AS n FROM evenements WHERE org_id = ? AND type = 'culte' AND date >= ? AND date < ?",
    oid, dateDebut, dateFin);

  const presence = await tauxPresence(
    'WHERE e.org_id = ? AND e.date >= ? AND e.date < ?', [oid, dateDebut, dateFin]);

  const comptages = await db.get(`
    SELECT COALESCE(SUM(c.hommes), 0) AS h, COALESCE(SUM(c.femmes), 0) AS f,
           COALESCE(SUM(c.enfants), 0) AS e
    FROM comptages c JOIN evenements ev ON ev.id = c.evenement_id
    WHERE ev.org_id = ? AND ev.date >= ? AND ev.date < ?
  `, oid, dateDebut, dateFin);

  const tribus = await db.all(`
    SELECT t.id, t.nom,
      (SELECT COUNT(*) FROM users u WHERE u.tribu_id = t.id AND u.statut = 'actif') AS nb_membres
    FROM tribus t WHERE t.org_id = ? ORDER BY t.nom`, oid);
  const parTribu = [];
  for (const t of tribus) {
    const s = await tauxPresence('WHERE u.tribu_id = ? AND e.date >= ? AND e.date < ? AND u.org_id = ?',
      [t.id, dateDebut, dateFin, oid]);
    parTribu.push({ id: t.id, nom: t.nom, nb_membres: t.nb_membres, taux: s.taux });
  }

  const depts = await db.all(`
    SELECT d.id, d.nom,
      (SELECT COUNT(*) FROM membres_departements m JOIN users u ON u.id = m.membre_id
        WHERE m.departement_id = d.id AND u.statut = 'actif') AS nb_membres
    FROM departements d WHERE d.org_id = ? ORDER BY d.nom`, oid);
  const parDept = [];
  for (const d of depts) {
    const s = await tauxPresence(
      'WHERE u.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?) AND e.date >= ? AND e.date < ? AND u.org_id = ?',
      [d.id, dateDebut, dateFin, oid]);
    parDept.push({ id: d.id, nom: d.nom, nb_membres: d.nb_membres, taux: s.taux });
  }

  await db.run(`
    INSERT INTO bilans_mensuels (org_id, mois, fideles_actifs, nouveaux_inscrits, nb_evenements,
      nb_cultes, nb_pointages, taux_presence, comptage_hommes, comptage_femmes,
      comptage_enfants, par_tribu, par_departement, saisi_par)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (org_id, mois)
    DO UPDATE SET fideles_actifs = EXCLUDED.fideles_actifs,
      nouveaux_inscrits = EXCLUDED.nouveaux_inscrits,
      nb_evenements = EXCLUDED.nb_evenements, nb_cultes = EXCLUDED.nb_cultes,
      nb_pointages = EXCLUDED.nb_pointages, taux_presence = EXCLUDED.taux_presence,
      comptage_hommes = EXCLUDED.comptage_hommes, comptage_femmes = EXCLUDED.comptage_femmes,
      comptage_enfants = EXCLUDED.comptage_enfants,
      par_tribu = EXCLUDED.par_tribu, par_departement = EXCLUDED.par_departement,
      saisi_par = EXCLUDED.saisi_par
  `, oid, mois, effectifs.n, nouveaux.n || 0, evenements.n, cultes.n,
     presence.total, presence.taux, comptages.h, comptages.f, comptages.e,
     JSON.stringify(parTribu), JSON.stringify(parDept), req.user.id);

  res.json({ ok: true, mois });
});

router.get('/bilans', requireDirection, async (req, res) => {
  const bilans = await db.all(
    'SELECT * FROM bilans_mensuels WHERE org_id = ? ORDER BY mois DESC LIMIT 24', req.org_id);
  for (const b of bilans) {
    try { b.par_tribu = JSON.parse(b.par_tribu); } catch { b.par_tribu = []; }
    try { b.par_departement = JSON.parse(b.par_departement); } catch { b.par_departement = []; }
  }
  res.json({ bilans });
});

router.get('/me', async (req, res) => {
  const presences = await assiduite(req.user.id);
  const cotisations = await db.get(`
    SELECT COUNT(*) AS nb,
           SUM(CASE WHEN statut = 'paye' THEN montant ELSE 0 END) AS total_paye,
           SUM(CASE WHEN statut = 'non_paye' THEN montant ELSE 0 END) AS total_du
    FROM cotisations WHERE membre_id = ?
  `, req.user.id);

  let tribu = null;
  if (req.user.tribu_id) {
    const t = await db.get('SELECT nom FROM tribus WHERE id = ?', req.user.tribu_id);
    const stats = await tauxPresence('WHERE u.tribu_id = ?', [req.user.tribu_id]);
    tribu = { nom: t ? t.nom : null, taux_presence: stats.taux };
  }

  res.json({
    presences: { ...presences, taux: presences.taux },
    cotisations,
    tribu,
    evolution: await evolutionMensuelle('WHERE u.id = ?', [req.user.id]),
  });
});

module.exports = router;
