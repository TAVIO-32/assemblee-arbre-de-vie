/**
 * routes/stats.js — Tableaux de bord et statistiques.
 *
 *  /global           corps pastoral : effectifs, rôles, tribus, départements,
 *                    évolution mensuelle, assiduité, alertes
 *  /tribu/:id        patriarche (la sienne) ou corps pastoral
 *  /departement/:id  responsable (le sien) ou corps pastoral
 *  /me               chaque fidèle : ses propres indicateurs
 *
 * Alerte « absences consécutives » : un fidèle dont les 3 derniers pointages
 * (du plus récent au plus ancien) sont « absent » est signalé pour un suivi.
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

/* ---------------- Briques de calcul ---------------- */

/** Taux de présence (%) sur l'ensemble des pointages correspondant au filtre. */
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

/** Évolution mensuelle du taux de présence (12 derniers mois renseignés). */
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
    .reverse(); // du plus ancien au plus récent, pour l'affichage
}

/** Assiduité individuelle des fidèles correspondant au filtre. */
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

/**
 * Fidèles dont les N derniers pointages sont tous « absent ».
 * @param {string} where clause portant sur « u » (users), déjà préfixée AND
 */
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

  // Regroupe les pointages par fidèle (déjà triés du plus récent au plus ancien).
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

/* ---------------- Tableau de bord global ---------------- */

/** GET /api/stats/global — vue d'ensemble de l'assemblée (corps pastoral). */
router.get('/global', requireDirection, async (req, res) => {
  const effectifs = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE statut = 'actif')        AS fideles_actifs,
      (SELECT COUNT(*) FROM users WHERE statut = 'en_attente')   AS comptes_en_attente,
      (SELECT COUNT(*) FROM users WHERE statut = 'actif' AND tribu_id IS NULL) AS sans_tribu,
      (SELECT COUNT(*) FROM tribus)                              AS tribus,
      (SELECT COUNT(*) FROM departements)                        AS departements,
      (SELECT COUNT(*) FROM evenements)                          AS evenements,
      (SELECT COUNT(*) FROM presences)                           AS pointages,
      (SELECT COUNT(*) FROM demandes WHERE statut = 'nouveau')   AS demandes_nouvelles
  `);

  // Répartition par rôle, dans l'ordre hiérarchique.
  const comptesRoles = await db.all(
    "SELECT role, COUNT(*) AS nb FROM users WHERE statut = 'actif' GROUP BY role");
  const parRole = CODES_ROLES.map((code) => ({
    role: code,
    libelle: ROLES[code].libelle,
    niveau: ROLES[code].niveau,
    nb: (comptesRoles.find((c) => c.role === code) || { nb: 0 }).nb,
  }));

  // Tribus : effectif, patriarche et taux de présence.
  const tribus = await db.all(`
    SELECT t.id, t.nom, t.patriarche_id,
      p.prenom AS patriarche_prenom, p.nom AS patriarche_nom, p.photo AS patriarche_photo,
      (SELECT COUNT(*) FROM users u WHERE u.tribu_id = t.id AND u.statut = 'actif') AS nb_membres
    FROM tribus t LEFT JOIN users p ON p.id = t.patriarche_id
    ORDER BY t.nom`);
  const parTribu = [];
  for (const t of tribus) {
    const stats = await tauxPresence('WHERE u.tribu_id = ?', [t.id]);
    parTribu.push({ ...t, ...stats, taux_presence: stats.taux });
  }

  // Départements : effectif, responsable et taux de présence.
  const departements = await db.all(`
    SELECT d.id, d.nom, d.responsable_id,
      r.prenom AS responsable_prenom, r.nom AS responsable_nom, r.photo AS responsable_photo,
      (SELECT COUNT(*) FROM membres_departements m JOIN users u ON u.id = m.membre_id
        WHERE m.departement_id = d.id AND u.statut = 'actif') AS nb_membres
    FROM departements d LEFT JOIN users r ON r.id = d.responsable_id
    ORDER BY d.nom`);
  const parDepartement = [];
  for (const d of departements) {
    const stats = await tauxPresence(
      'WHERE u.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?)', [d.id]);
    parDepartement.push({ ...d, ...stats, taux_presence: stats.taux });
  }

  const presenceGlobale = await tauxPresence('', []);
  const membres = await assiduiteMembres("WHERE u.statut = 'actif'");
  const classes = membres.filter((m) => m.total >= 3).sort((a, b) => b.taux_presence - a.taux_presence);
  // Les deux palmarès ne doivent jamais citer le même fidèle : sur un petit
  // effectif, le début et la fin du classement se recouvriraient.
  const plusAssidus = classes.slice(0, 5);
  const dejaCites = new Set(plusAssidus.map((m) => m.id));
  const moinsAssidus = classes.slice().reverse().filter((m) => !dejaCites.has(m.id)).slice(0, 5);

  const comptages = await db.get(`
    SELECT COALESCE(SUM(hommes), 0) AS total_hommes,
           COALESCE(SUM(femmes), 0) AS total_femmes,
           COALESCE(SUM(enfants), 0) AS total_enfants,
           COUNT(*) AS nb_comptages
    FROM comptages
  `);

  res.json({
    effectifs,
    presence: presenceGlobale,
    taux_presence_global: presenceGlobale.taux,
    par_role: parRole,
    par_tribu: parTribu,
    par_departement: parDepartement,
    evolution: await evolutionMensuelle(''),
    plus_assidus: plusAssidus,
    moins_assidus: moinsAssidus,
    alertes_absences: await membresEnAlerte(),
    comptages,
  });
});

/* ---------------- Tableau de bord d'une tribu ---------------- */

/** GET /api/stats/tribu/:id — indicateurs d'une tribu (patriarche / corps pastoral). */
router.get('/tribu/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!peutAccederTribu(req, id)) {
    return res.status(403).json({ error: 'Cette tribu ne relève pas de votre périmètre.' });
  }
  const tribu = await db.get(`
    SELECT t.*, p.prenom AS patriarche_prenom, p.nom AS patriarche_nom, p.photo AS patriarche_photo
    FROM tribus t LEFT JOIN users p ON p.id = t.patriarche_id WHERE t.id = ?`, id);
  if (!tribu) return res.status(404).json({ error: 'Tribu introuvable.' });

  // Deux mesures distinctes, volontairement séparées :
  //  · presence           = assiduité générale des fidèles de la tribu
  //    (tous les pointages les concernant, cultes d'assemblée compris) ;
  //  · presence_activites = présence aux réunions propres à la tribu.
  const presence = await tauxPresence('WHERE u.tribu_id = ?', [id]);
  const presenceActivites = await tauxPresence('WHERE u.tribu_id = ? AND e.tribu_id = ?', [id, id]);
  const membres = await assiduiteMembres("WHERE u.tribu_id = ? AND u.statut = 'actif'", [id]);

  // Derniers événements ayant concerné la tribu (portée tribu ou assemblée).
  const evenements = await db.all(`
    SELECT e.id, e.titre, e.type, e.date, e.portee,
      (SELECT COUNT(*) FROM presences p JOIN users u ON u.id = p.membre_id
        WHERE p.evenement_id = e.id AND u.tribu_id = ?) AS nb_pointes,
      (SELECT COUNT(*) FROM presences p JOIN users u ON u.id = p.membre_id
        WHERE p.evenement_id = e.id AND u.tribu_id = ? AND p.statut = 'present') AS nb_presents,
      c.hommes AS comptage_hommes, c.femmes AS comptage_femmes, c.enfants AS comptage_enfants
    FROM evenements e
    LEFT JOIN comptages c ON c.evenement_id = e.id
    WHERE e.portee = 'assemblee' OR e.tribu_id = ?
    ORDER BY e.date DESC, e.id DESC LIMIT 10
  `, id, id, id);

  res.json({
    tribu,
    presence,
    presence_activites: presenceActivites,
    taux_presence: presence.taux,
    nb_membres: membres.length,
    membres,
    evenements,
    evolution: await evolutionMensuelle('WHERE u.tribu_id = ?', [id]),
    alertes_absences: await membresEnAlerte('AND u.tribu_id = ?', [id]),
  });
});

/* ---------------- Tableau de bord d'un département ---------------- */

/** GET /api/stats/departement/:id — indicateurs d'un département. */
router.get('/departement/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!peutAccederDepartement(req, id)) {
    return res.status(403).json({ error: 'Ce département ne relève pas de votre périmètre.' });
  }
  const departement = await db.get(`
    SELECT d.*, r.prenom AS responsable_prenom, r.nom AS responsable_nom, r.photo AS responsable_photo
    FROM departements d LEFT JOIN users r ON r.id = d.responsable_id WHERE d.id = ?`, id);
  if (!departement) return res.status(404).json({ error: 'Département introuvable.' });

  const appartenance = 'u.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?)';
  // Comme pour les tribus : assiduité générale des membres d'une part,
  // présence aux activités propres au département d'autre part.
  const presence = await tauxPresence(`WHERE ${appartenance}`, [id]);
  const presenceActivites = await tauxPresence(`WHERE ${appartenance} AND e.departement_id = ?`, [id, id]);
  const membres = await assiduiteMembres(`WHERE ${appartenance} AND u.statut = 'actif'`, [id]);

  const evenements = await db.all(`
    SELECT e.id, e.titre, e.type, e.date, e.portee,
      (SELECT COUNT(*) FROM presences p WHERE p.evenement_id = e.id) AS nb_pointes,
      (SELECT COUNT(*) FROM presences p WHERE p.evenement_id = e.id AND p.statut = 'present') AS nb_presents,
      c.hommes AS comptage_hommes, c.femmes AS comptage_femmes, c.enfants AS comptage_enfants
    FROM evenements e
    LEFT JOIN comptages c ON c.evenement_id = e.id
    WHERE e.departement_id = ?
    ORDER BY e.date DESC, e.id DESC LIMIT 10
  `, id);

  res.json({
    departement,
    presence,
    presence_activites: presenceActivites,
    taux_presence: presence.taux,
    nb_membres: membres.length,
    membres,
    evenements,
    evolution: await evolutionMensuelle(`WHERE ${appartenance}`, [id]),
    alertes_absences: await membresEnAlerte(`AND ${appartenance}`, [id]),
  });
});

/* ---------------- Bilans mensuels ---------------- */

/**
 * POST /api/stats/bilan — sauvegarde le bilan du mois (corps pastoral).
 * Corps : { mois: 'AAAA-MM' } (défaut : mois courant)
 * Calcule un snapshot complet et le stocke pour l'historique d'évolution.
 */
router.post('/bilan', requireDirection, async (req, res) => {
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
    "SELECT COUNT(*) AS n FROM users WHERE statut = 'actif'");

  const nouveaux = await db.get(
    "SELECT COUNT(*) AS n FROM users WHERE statut = 'actif' AND created_at >= ? AND created_at < ?",
    dateDebut, dateFin);

  const evenements = await db.get(
    'SELECT COUNT(*) AS n FROM evenements WHERE date >= ? AND date < ?',
    dateDebut, dateFin);

  const cultes = await db.get(
    "SELECT COUNT(*) AS n FROM evenements WHERE type = 'culte' AND date >= ? AND date < ?",
    dateDebut, dateFin);

  const presence = await tauxPresence(
    'WHERE e.date >= ? AND e.date < ?', [dateDebut, dateFin]);

  const comptages = await db.get(`
    SELECT COALESCE(SUM(c.hommes), 0) AS h, COALESCE(SUM(c.femmes), 0) AS f,
           COALESCE(SUM(c.enfants), 0) AS e
    FROM comptages c JOIN evenements ev ON ev.id = c.evenement_id
    WHERE ev.date >= ? AND ev.date < ?
  `, dateDebut, dateFin);

  const tribus = await db.all(`
    SELECT t.id, t.nom,
      (SELECT COUNT(*) FROM users u WHERE u.tribu_id = t.id AND u.statut = 'actif') AS nb_membres
    FROM tribus t ORDER BY t.nom`);
  const parTribu = [];
  for (const t of tribus) {
    const s = await tauxPresence('WHERE u.tribu_id = ? AND e.date >= ? AND e.date < ?',
      [t.id, dateDebut, dateFin]);
    parTribu.push({ id: t.id, nom: t.nom, nb_membres: t.nb_membres, taux: s.taux });
  }

  const depts = await db.all(`
    SELECT d.id, d.nom,
      (SELECT COUNT(*) FROM membres_departements m JOIN users u ON u.id = m.membre_id
        WHERE m.departement_id = d.id AND u.statut = 'actif') AS nb_membres
    FROM departements d ORDER BY d.nom`);
  const parDept = [];
  for (const d of depts) {
    const s = await tauxPresence(
      'WHERE u.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?) AND e.date >= ? AND e.date < ?',
      [d.id, dateDebut, dateFin]);
    parDept.push({ id: d.id, nom: d.nom, nb_membres: d.nb_membres, taux: s.taux });
  }

  await db.run(`
    INSERT INTO bilans_mensuels (mois, fideles_actifs, nouveaux_inscrits, nb_evenements,
      nb_cultes, nb_pointages, taux_presence, comptage_hommes, comptage_femmes,
      comptage_enfants, par_tribu, par_departement, saisi_par)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (mois)
    DO UPDATE SET fideles_actifs = EXCLUDED.fideles_actifs,
      nouveaux_inscrits = EXCLUDED.nouveaux_inscrits,
      nb_evenements = EXCLUDED.nb_evenements, nb_cultes = EXCLUDED.nb_cultes,
      nb_pointages = EXCLUDED.nb_pointages, taux_presence = EXCLUDED.taux_presence,
      comptage_hommes = EXCLUDED.comptage_hommes, comptage_femmes = EXCLUDED.comptage_femmes,
      comptage_enfants = EXCLUDED.comptage_enfants,
      par_tribu = EXCLUDED.par_tribu, par_departement = EXCLUDED.par_departement,
      saisi_par = EXCLUDED.saisi_par
  `, mois, effectifs.n, nouveaux.n || 0, evenements.n, cultes.n,
     presence.total, presence.taux, comptages.h, comptages.f, comptages.e,
     JSON.stringify(parTribu), JSON.stringify(parDept), req.user.id);

  res.json({ ok: true, mois });
});

/** GET /api/stats/bilans — historique des bilans mensuels (corps pastoral). */
router.get('/bilans', requireDirection, async (req, res) => {
  const bilans = await db.all(
    'SELECT * FROM bilans_mensuels ORDER BY mois DESC LIMIT 24');
  for (const b of bilans) {
    try { b.par_tribu = JSON.parse(b.par_tribu); } catch { b.par_tribu = []; }
    try { b.par_departement = JSON.parse(b.par_departement); } catch { b.par_departement = []; }
  }
  res.json({ bilans });
});

/* ---------------- Indicateurs personnels ---------------- */

/** GET /api/stats/me — indicateurs du fidèle connecté. */
router.get('/me', async (req, res) => {
  const presences = await assiduite(req.user.id);
  const cotisations = await db.get(`
    SELECT COUNT(*) AS nb,
           SUM(CASE WHEN statut = 'paye' THEN montant ELSE 0 END) AS total_paye,
           SUM(CASE WHEN statut = 'non_paye' THEN montant ELSE 0 END) AS total_du
    FROM cotisations WHERE membre_id = ?
  `, req.user.id);

  // Position dans sa tribu (motivation, sans classement nominatif).
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
