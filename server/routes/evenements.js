/**
 * routes/evenements.js — Evenements et fiches de presence (multi-tenant ZAURA).
 */
const express = require('express');
const db = require('../db');
const { TYPES_EVENEMENT, PORTEES, STATUTS_PRESENCE } = require('../constants');
const {
  requireAuth, requireEncadrement, filtreMembres,
  peutAccederTribu, peutAccederDepartement,
} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function conditionsPortee(ev, alias = 'u') {
  const conditions = [`${alias}.statut = 'actif'`, `${alias}.org_id = ${ev.org_id}`];
  const params = [];
  if (ev.portee === 'tribu') { conditions.push(`${alias}.tribu_id = ?`); params.push(ev.tribu_id); }
  else if (ev.portee === 'departement') {
    conditions.push(`${alias}.id IN (SELECT membre_id FROM membres_departements WHERE departement_id = ?)`);
    params.push(ev.departement_id);
  }
  return { conditions, params };
}

function estDansPerimetre(req, ev) {
  if (req.perimetre.tout) return true;
  if (ev.portee === 'assemblee') return req.perimetre.tribus.length > 0 || req.perimetre.departements.length > 0;
  if (ev.portee === 'tribu') return peutAccederTribu(req, ev.tribu_id);
  return peutAccederDepartement(req, ev.departement_id);
}

async function chargerEvenement(req, res) {
  const ev = await db.get(`
    SELECT e.*, t.nom AS tribu_nom, d.nom AS departement_nom
    FROM evenements e
    LEFT JOIN tribus t ON t.id = e.tribu_id
    LEFT JOIN departements d ON d.id = e.departement_id
    WHERE e.id = ? AND e.org_id = ?`, Number(req.params.id), req.org_id);
  if (!ev) { res.status(404).json({ error: 'Evenement introuvable.' }); return null; }
  if (!estDansPerimetre(req, ev)) { res.status(403).json({ error: 'Acces refuse.' }); return null; }
  return ev;
}

router.get('/', requireEncadrement, async (req, res) => {
  const filtre = filtreMembres(req, 'u2');
  const clauseFiltre = filtre ? ` AND ${filtre.sql}` : '';
  const params = [];
  const nbConcernes = `(SELECT COUNT(*) FROM users u2 WHERE u2.statut = 'actif' AND u2.org_id = e.org_id
      AND (e.portee = 'assemblee'
        OR (e.portee = 'tribu' AND u2.tribu_id = e.tribu_id)
        OR (e.portee = 'departement' AND u2.id IN
            (SELECT membre_id FROM membres_departements md WHERE md.departement_id = e.departement_id)))
      ${clauseFiltre})`;
  const nbPointes = `(SELECT COUNT(*) FROM presences p JOIN users u2 ON u2.id = p.membre_id
      WHERE p.evenement_id = e.id${clauseFiltre})`;
  const nbPresents = `(SELECT COUNT(*) FROM presences p JOIN users u2 ON u2.id = p.membre_id
      WHERE p.evenement_id = e.id AND p.statut = 'present'${clauseFiltre})`;
  let sql = `
    SELECT e.*, t.nom AS tribu_nom, d.nom AS departement_nom,
      ${nbConcernes} AS nb_concernes, ${nbPointes} AS nb_pointes, ${nbPresents} AS nb_presents,
      c.hommes AS comptage_hommes, c.femmes AS comptage_femmes, c.enfants AS comptage_enfants
    FROM evenements e
    LEFT JOIN tribus t ON t.id = e.tribu_id
    LEFT JOIN departements d ON d.id = e.departement_id
    LEFT JOIN comptages c ON c.evenement_id = e.id`;
  if (filtre) params.push(...filtre.params, ...filtre.params, ...filtre.params);
  const conditions = ['e.org_id = ?'];
  params.push(req.org_id);
  if (!req.perimetre.tout) {
    const morceaux = ["e.portee = 'assemblee'"];
    const { tribus, departements } = req.perimetre;
    if (tribus.length) { morceaux.push(`e.tribu_id IN (${db.placeholders(tribus.length)})`); params.push(...tribus); }
    if (departements.length) { morceaux.push(`e.departement_id IN (${db.placeholders(departements.length)})`); params.push(...departements); }
    conditions.push(`(${morceaux.join(' OR ')})`);
  }
  if (req.query.portee && PORTEES[req.query.portee]) { conditions.push('e.portee = ?'); params.push(req.query.portee); }
  sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY e.date DESC, e.id DESC LIMIT 200';
  res.json({ evenements: await db.all(sql, ...params) });
});

router.post('/', requireEncadrement, async (req, res) => {
  const { type, titre, date } = req.body || {};
  let { portee, tribu_id, departement_id } = req.body || {};
  if (!TYPES_EVENEMENT[type]) return res.status(400).json({ error: "Type invalide." });
  if (!titre || !String(titre).trim()) return res.status(400).json({ error: 'Titre obligatoire.' });
  if (!date) return res.status(400).json({ error: 'Date obligatoire.' });
  if (!PORTEES[portee]) return res.status(400).json({ error: 'Portee invalide.' });
  if (portee === 'assemblee') {
    if (!req.perimetre.tout) return res.status(403).json({ error: "Reserve au corps pastoral." });
    tribu_id = null; departement_id = null;
  } else if (portee === 'tribu') {
    tribu_id = Number(tribu_id);
    if (!tribu_id || !peutAccederTribu(req, tribu_id)) return res.status(403).json({ error: 'Acces refuse.' });
    departement_id = null;
  } else {
    departement_id = Number(departement_id);
    if (!departement_id || !peutAccederDepartement(req, departement_id)) return res.status(403).json({ error: 'Acces refuse.' });
    tribu_id = null;
  }
  const id = await db.insert(`
    INSERT INTO evenements (org_id, type, titre, date, portee, tribu_id, departement_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, req.org_id, type, String(titre).trim(), String(date).slice(0, 10), portee,
     tribu_id || null, departement_id || null, req.user.id);
  res.status(201).json({ id });
});

router.post('/generer-cultes', requireEncadrement, async (req, res) => {
  if (!req.perimetre.tout) return res.status(403).json({ error: "Reserve au corps pastoral." });
  const mois = String(req.body?.mois || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mois)) return res.status(400).json({ error: 'Format: AAAA-MM.' });
  const [annee, m] = mois.split('-').map(Number);
  const nbJours = new Date(annee, m, 0).getDate();
  const cultes = [];
  for (let j = 1; j <= nbJours; j++) {
    const d = new Date(annee, m - 1, j);
    const jour = d.getDay();
    if (jour === 0) cultes.push({ date: `${mois}-${String(j).padStart(2, '0')}`, titre: `Culte du dimanche ${j}/${String(m).padStart(2, '0')}` });
    if (jour === 3) cultes.push({ date: `${mois}-${String(j).padStart(2, '0')}`, titre: `Culte du mercredi soir ${j}/${String(m).padStart(2, '0')}` });
  }
  let crees = 0;
  for (const c of cultes) {
    const existe = await db.get(
      "SELECT id FROM evenements WHERE org_id = ? AND type = 'culte' AND date = ? AND portee = 'assemblee'", req.org_id, c.date);
    if (!existe) {
      await db.insert(
        "INSERT INTO evenements (org_id, type, titre, date, portee, created_by) VALUES (?, 'culte', ?, ?, 'assemblee', ?)",
        req.org_id, c.titre, c.date, req.user.id);
      crees++;
    }
  }
  res.status(201).json({ ok: true, crees, total: cultes.length });
});

router.delete('/:id', requireEncadrement, async (req, res) => {
  const ev = await chargerEvenement(req, res);
  if (!ev) return;
  if (!req.perimetre.tout && ev.created_by !== req.user.id) return res.status(403).json({ error: 'Acces refuse.' });
  await db.run('DELETE FROM evenements WHERE id = ?', ev.id);
  res.json({ ok: true });
});

router.get('/presences/me', async (req, res) => {
  const historique = await db.all(`
    SELECT e.titre, e.type, e.date, e.portee, p.statut,
           t.nom AS tribu_nom, d.nom AS departement_nom
    FROM presences p
    JOIN evenements e ON e.id = p.evenement_id
    LEFT JOIN tribus t ON t.id = e.tribu_id
    LEFT JOIN departements d ON d.id = e.departement_id
    WHERE p.membre_id = ? ORDER BY e.date DESC, e.id DESC LIMIT 100
  `, req.user.id);
  res.json({ historique });
});

router.get('/:id/presences', requireEncadrement, async (req, res) => {
  const ev = await chargerEvenement(req, res);
  if (!ev) return;
  const { conditions, params } = conditionsPortee(ev, 'u');
  const filtre = filtreMembres(req, 'u');
  if (filtre) { conditions.push(filtre.sql); params.push(...filtre.params); }
  const feuille = await db.all(`
    SELECT u.id AS membre_id, u.nom, u.prenom, u.telephone, u.whatsapp,
           u.photo, u.role, u.tribu_id, t.nom AS tribu_nom, p.statut, p.commentaire
    FROM users u
    LEFT JOIN tribus t ON t.id = u.tribu_id
    LEFT JOIN presences p ON p.membre_id = u.id AND p.evenement_id = ?
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.nom, u.nom, u.prenom
  `, ev.id, ...params);
  res.json({ evenement: ev, feuille });
});

router.get('/:id/comptage', requireEncadrement, async (req, res) => {
  const ev = await chargerEvenement(req, res);
  if (!ev) return;
  const comptage = await db.get('SELECT * FROM comptages WHERE evenement_id = ?', ev.id);
  res.json({ evenement: ev, comptage: comptage || null });
});

router.put('/:id/comptage', requireEncadrement, async (req, res) => {
  const ev = await chargerEvenement(req, res);
  if (!ev) return;
  const hommes = Math.max(0, Number(req.body?.hommes) || 0);
  const femmes = Math.max(0, Number(req.body?.femmes) || 0);
  const enfants = Math.max(0, Number(req.body?.enfants) || 0);
  const notes = String(req.body?.notes || '').trim();
  await db.run(`
    INSERT INTO comptages (evenement_id, hommes, femmes, enfants, notes, saisi_par)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (evenement_id)
    DO UPDATE SET hommes = EXCLUDED.hommes, femmes = EXCLUDED.femmes,
                  enfants = EXCLUDED.enfants, notes = EXCLUDED.notes, saisi_par = EXCLUDED.saisi_par
  `, ev.id, hommes, femmes, enfants, notes, req.user.id);
  res.json({ ok: true, total: hommes + femmes + enfants });
});

router.put('/:id/presences', requireEncadrement, async (req, res) => {
  const ev = await chargerEvenement(req, res);
  if (!ev) return;
  const lignes = Array.isArray(req.body?.presences) ? req.body.presences : [];
  const { conditions, params } = conditionsPortee(ev, 'u');
  const filtre = filtreMembres(req, 'u');
  if (filtre) { conditions.push(filtre.sql); params.push(...filtre.params); }
  const autorises = new Set(
    (await db.all(`SELECT u.id FROM users u WHERE ${conditions.join(' AND ')}`, ...params)).map((m) => m.id)
  );
  let enregistres = 0, ignores = 0;
  for (const ligne of lignes) {
    const membreId = Number(ligne.membre_id);
    if (!STATUTS_PRESENCE[ligne.statut] || !autorises.has(membreId)) { ignores++; continue; }
    await db.run(`
      INSERT INTO presences (evenement_id, membre_id, statut, commentaire, pointe_par)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (evenement_id, membre_id)
      DO UPDATE SET statut = EXCLUDED.statut, commentaire = EXCLUDED.commentaire, pointe_par = EXCLUDED.pointe_par
    `, ev.id, membreId, ligne.statut, String(ligne.commentaire || '').trim(), req.user.id);
    enregistres++;
  }
  res.json({ ok: true, enregistres, ignores });
});

module.exports = router;
