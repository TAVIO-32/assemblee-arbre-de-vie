/**
 * auth.js — Authentification multi-tenant ZAURA.
 *
 * Chaque requete est scopee a une organisation via org_id.
 * Le super admin a un systeme de session separe.
 */
const jwt = require('jsonwebtoken');
const db = require('../db');
const { ROLES_DIRECTION, niveauRole } = require('../constants');

const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');
const COOKIE_NAME = 'zaura_session';
const COOKIE_ADMIN = 'zaura_admin';

function setSessionCookie(res, user) {
  const token = jwt.sign({ id: user.id, org_id: user.org_id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

function setAdminCookie(res, admin) {
  const token = jwt.sign({ id: admin.id, superAdmin: true }, JWT_SECRET, { expiresIn: '24h' });
  res.cookie(COOKIE_ADMIN, token, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 3600 * 1000,
  });
}

function clearSessionCookie(res) { res.clearCookie(COOKIE_NAME); }
function clearAdminCookie(res) { res.clearCookie(COOKIE_ADMIN); }

function estDirection(user) {
  return ROLES_DIRECTION.includes(user.role);
}

async function perimetre(user) {
  if (estDirection(user)) return { tout: true, tribus: [], departements: [] };
  const tribus = (await db.all('SELECT id FROM tribus WHERE patriarche_id = ?', user.id)).map((t) => t.id);
  const departements = (await db.all('SELECT id FROM departements WHERE responsable_id = ?', user.id)).map((d) => d.id);
  if (user.role === 'patriarche' && !tribus.length && user.tribu_id) tribus.push(user.tribu_id);
  return { tout: false, tribus, departements };
}

async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Non connecte.' });
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ error: 'Session expiree, reconnectez-vous.' });
  }
  const user = await db.get('SELECT * FROM users WHERE id = ?', payload.id);
  if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
  if (user.statut !== 'actif') return res.status(403).json({ error: 'Compte en attente de validation.' });

  const org = await db.get('SELECT * FROM organisations WHERE id = ?', user.org_id);
  if (!org) return res.status(403).json({ error: 'Organisation introuvable.' });
  if (org.statut === 'suspendu') return res.status(403).json({ error: 'Abonnement suspendu. Contactez votre administrateur.' });
  if (org.statut === 'expire') return res.status(403).json({ error: 'Abonnement expire. Veuillez renouveler.' });

  delete user.password_hash;
  req.user = user;
  req.org_id = user.org_id;
  req.org = org;
  req.perimetre = await perimetre(user);
  next();
}

async function requireSuperAdmin(req, res, next) {
  const token = req.cookies[COOKIE_ADMIN];
  if (!token) return res.status(401).json({ error: 'Non connecte (admin).' });
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ error: 'Session admin expiree.' });
  }
  if (!payload.superAdmin) return res.status(403).json({ error: 'Acces refuse.' });
  const admin = await db.get('SELECT id, email, nom FROM super_admins WHERE id = ?', payload.id);
  if (!admin) return res.status(401).json({ error: 'Admin introuvable.' });
  req.admin = admin;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Acces refuse pour votre role.' });
    next();
  };
}

function requireDirection(req, res, next) {
  if (!estDirection(req.user)) return res.status(403).json({ error: 'Reserve au corps pastoral.' });
  next();
}

function requireNiveau(minimum) {
  return (req, res, next) => {
    if (niveauRole(req.user.role) < minimum) return res.status(403).json({ error: 'Niveau hierarchique insuffisant.' });
    next();
  };
}

function requireEncadrement(req, res, next) {
  if (req.perimetre.tout || req.perimetre.tribus.length || req.perimetre.departements.length) return next();
  return res.status(403).json({ error: "Aucune tribu ni departement sous votre responsabilite." });
}

function peutAccederTribu(req, tribuId) {
  return req.perimetre.tout || req.perimetre.tribus.includes(Number(tribuId));
}

function peutAccederDepartement(req, departementId) {
  return req.perimetre.tout || req.perimetre.departements.includes(Number(departementId));
}

async function peutAccederMembre(req, membreId) {
  membreId = Number(membreId);
  if (req.user.id === membreId) return true;
  if (req.perimetre.tout) return true;
  const { tribus, departements } = req.perimetre;
  if (tribus.length) {
    const t = await db.get(
      `SELECT 1 AS ok FROM users WHERE id = ? AND tribu_id IN (${db.placeholders(tribus.length)})`,
      membreId, ...tribus
    );
    if (t) return true;
  }
  if (departements.length) {
    const d = await db.get(
      `SELECT 1 AS ok FROM membres_departements
       WHERE membre_id = ? AND departement_id IN (${db.placeholders(departements.length)})`,
      membreId, ...departements
    );
    if (d) return true;
  }
  return false;
}

function filtreMembres(req, alias = 'u') {
  if (req.perimetre.tout) return null;
  const { tribus, departements } = req.perimetre;
  const morceaux = [];
  const params = [];
  if (tribus.length) {
    morceaux.push(`${alias}.tribu_id IN (${db.placeholders(tribus.length)})`);
    params.push(...tribus);
  }
  if (departements.length) {
    morceaux.push(`${alias}.id IN (SELECT membre_id FROM membres_departements
                    WHERE departement_id IN (${db.placeholders(departements.length)}))`);
    params.push(...departements);
  }
  if (!morceaux.length) return { sql: `${alias}.id = ?`, params: [req.user.id] };
  return { sql: `(${morceaux.join(' OR ')})`, params };
}

function peutGererRole(acteur, roleCible) {
  if (acteur.role === 'pasteur_principal') return true;
  return niveauRole(roleCible) < niveauRole(acteur.role);
}

module.exports = {
  COOKIE_NAME, COOKIE_ADMIN,
  setSessionCookie, setAdminCookie,
  clearSessionCookie, clearAdminCookie,
  requireAuth, requireSuperAdmin,
  requireRole, requireDirection, requireNiveau, requireEncadrement,
  estDirection, perimetre,
  peutAccederTribu, peutAccederDepartement, peutAccederMembre,
  filtreMembres, peutGererRole,
};
