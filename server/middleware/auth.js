/**
 * auth.js — Authentification, hiérarchie et périmètres d'accès.
 *
 * Le contrôle d'accès est appliqué CÔTÉ SERVEUR sur chaque route.
 *
 * Hiérarchie (server/constants.js) :
 *    Pasteur Principal > Pasteur Assistant > Assistant Pasteur > Patriarche
 *
 * Périmètres :
 *  - corps pastoral (les 3 rôles de direction) : toute l'assemblée ;
 *  - patriarche               : les tribus dont il est le conducteur ;
 *  - responsable_departement  : les départements dont il est le responsable ;
 *  - fidèle                   : lui-même uniquement.
 *
 * Un responsable peut cumuler (ex. patriarche d'une tribu ET responsable d'un
 * département) : le périmètre est toujours l'union des deux listes.
 */
const jwt = require('jsonwebtoken');
const db = require('../db');
const { ROLES_DIRECTION, niveauRole } = require('../constants');

// Secret de signature des jetons de session.
// En production, définir la variable d'environnement JWT_SECRET.
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');
const COOKIE_NAME = 'arbre_de_vie_session';

/** Crée le cookie de session (httpOnly : inaccessible au JavaScript du navigateur). */
function setSessionCookie(res, user) {
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

/** Appartient au corps pastoral (périmètre : toute l'assemblée) ? */
function estDirection(user) {
  return ROLES_DIRECTION.includes(user.role);
}

/**
 * Périmètre effectif d'un utilisateur.
 * @returns {{ tout: boolean, tribus: number[], departements: number[] }}
 */
async function perimetre(user) {
  if (estDirection(user)) return { tout: true, tribus: [], departements: [] };
  const tribus = (await db.all('SELECT id FROM tribus WHERE patriarche_id = ?', user.id)).map((t) => t.id);
  const departements = (await db.all('SELECT id FROM departements WHERE responsable_id = ?', user.id)).map((d) => d.id);
  // Filet de sécurité : un patriarche non encore rattaché à une tribu conduit
  // au moins la sienne (cas d'un compte validé avant l'affectation).
  if (user.role === 'patriarche' && !tribus.length && user.tribu_id) tribus.push(user.tribu_id);
  return { tout: false, tribus, departements };
}

/** Recharge l'utilisateur depuis la base à chaque requête :
 *  un compte rejeté ou repassé « en attente » perd immédiatement l'accès. */
async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Non connecté.' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
  }
  const user = await db.get('SELECT * FROM users WHERE id = ?', payload.id);
  if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
  if (user.statut !== 'actif') {
    return res.status(403).json({ error: 'Compte en attente de validation.' });
  }
  delete user.password_hash;
  req.user = user;
  req.perimetre = await perimetre(user);
  next();
}

/** Restreint la route aux rôles listés. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé pour votre rôle.' });
    }
    next();
  };
}

/** Restreint la route au corps pastoral (Pasteur Principal / Assistant / Assistant Pasteur). */
function requireDirection(req, res, next) {
  if (!estDirection(req.user)) {
    return res.status(403).json({ error: 'Réservé au corps pastoral.' });
  }
  next();
}

/** Restreint la route à un niveau hiérarchique minimum. */
function requireNiveau(minimum) {
  return (req, res, next) => {
    if (niveauRole(req.user.role) < minimum) {
      return res.status(403).json({ error: 'Votre niveau hiérarchique ne permet pas cette action.' });
    }
    next();
  };
}

/** Restreint la route aux responsables disposant d'une équipe (tribu ou département). */
function requireEncadrement(req, res, next) {
  if (req.perimetre.tout || req.perimetre.tribus.length || req.perimetre.departements.length) return next();
  return res.status(403).json({ error: "Aucune tribu ni département n'est sous votre responsabilité." });
}

function peutAccederTribu(req, tribuId) {
  return req.perimetre.tout || req.perimetre.tribus.includes(Number(tribuId));
}

function peutAccederDepartement(req, departementId) {
  return req.perimetre.tout || req.perimetre.departements.includes(Number(departementId));
}

/** Peut-on consulter les données (présences, cotisations, demandes) d'un membre ? */
async function peutAccederMembre(req, membreId) {
  membreId = Number(membreId);
  if (req.user.id === membreId) return true;      // soi-même
  if (req.perimetre.tout) return true;            // corps pastoral
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

/**
 * Fragment SQL restreignant une requête sur « users u » au périmètre du
 * demandeur. Retourne null si aucune restriction n'est nécessaire.
 * @returns {{ sql: string, params: any[] } | null}
 */
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
  // Aucun périmètre d'équipe : le demandeur ne voit que lui-même.
  if (!morceaux.length) return { sql: `${alias}.id = ?`, params: [req.user.id] };
  return { sql: `(${morceaux.join(' OR ')})`, params };
}

/**
 * Un responsable ne peut agir que sur des comptes de niveau strictement
 * inférieur au sien ; le Pasteur Principal n'a pas cette limite.
 */
function peutGererRole(acteur, roleCible) {
  if (acteur.role === 'pasteur_principal') return true;
  return niveauRole(roleCible) < niveauRole(acteur.role);
}

module.exports = {
  COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireRole,
  requireDirection,
  requireNiveau,
  requireEncadrement,
  estDirection,
  perimetre,
  peutAccederTribu,
  peutAccederDepartement,
  peutAccederMembre,
  filtreMembres,
  peutGererRole,
};
