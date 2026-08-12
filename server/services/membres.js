/**
 * membres.js — Requêtes partagées autour de la fiche d'un fidèle.
 * Regroupe ici ce qui est utilisé par plusieurs routes (profil complet,
 * départements d'un membre, composition d'une fiche de présence).
 */
const db = require('../db');

/** Colonnes exposables d'un compte (jamais le mot de passe). */
const CHAMPS_PUBLICS = `u.id, u.nom, u.prenom, u.email, u.telephone, u.whatsapp,
  u.date_naissance, u.role, u.statut, u.tribu_id, u.tribu_souhaitee,
  u.departement_souhaite, u.created_at, t.nom AS tribu_nom`;

const JOINTURE_TRIBU = 'LEFT JOIN tribus t ON t.id = u.tribu_id';

/** Départements d'un membre : [{ id, nom }]. */
async function departementsDe(membreId) {
  return db.all(`
    SELECT d.id, d.nom FROM membres_departements m
    JOIN departements d ON d.id = m.departement_id
    WHERE m.membre_id = ? ORDER BY d.nom
  `, membreId);
}

/** Attache la liste des départements à chaque ligne d'une liste de membres. */
async function avecDepartements(membres) {
  if (!membres.length) return membres;
  const ids = membres.map((m) => m.id);
  const lignes = await db.all(`
    SELECT m.membre_id, d.id, d.nom FROM membres_departements m
    JOIN departements d ON d.id = m.departement_id
    WHERE m.membre_id IN (${db.placeholders(ids.length)})
    ORDER BY d.nom
  `, ...ids);
  const parMembre = new Map();
  for (const l of lignes) {
    if (!parMembre.has(l.membre_id)) parMembre.set(l.membre_id, []);
    parMembre.get(l.membre_id).push({ id: l.id, nom: l.nom });
  }
  return membres.map((m) => ({ ...m, departements: parMembre.get(m.id) || [] }));
}

/** Remplace intégralement les affectations d'un membre aux départements. */
async function definirDepartements(membreId, departementIds) {
  const ids = [...new Set((departementIds || []).map(Number).filter(Boolean))];
  await db.run('DELETE FROM membres_departements WHERE membre_id = ?', membreId);
  for (const id of ids) {
    const existe = await db.get('SELECT id FROM departements WHERE id = ?', id);
    if (!existe) continue;
    await db.run('INSERT INTO membres_departements (membre_id, departement_id) VALUES (?, ?)', membreId, id);
  }
  return ids.length;
}

/** Indicateurs de présence d'un membre (total, présents, taux). */
async function assiduite(membreId) {
  const r = await db.get(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN statut = 'present' THEN 1 ELSE 0 END) AS presents,
           SUM(CASE WHEN statut = 'absent'  THEN 1 ELSE 0 END) AS absents,
           SUM(CASE WHEN statut = 'excuse'  THEN 1 ELSE 0 END) AS excuses
    FROM presences WHERE membre_id = ?
  `, membreId);
  const total = r.total || 0;
  return {
    total,
    presents: r.presents || 0,
    absents: r.absents || 0,
    excuses: r.excuses || 0,
    taux: total ? Math.round(((r.presents || 0) / total) * 100) : null,
  };
}

module.exports = {
  CHAMPS_PUBLICS,
  JOINTURE_TRIBU,
  departementsDe,
  avecDepartements,
  definirDepartements,
  assiduite,
};
