/**
 * db.js — Base de donnees multi-tenant ZAURA.
 *
 * Chaque eglise (organisation) possede ses propres donnees isolees via org_id.
 * Double moteur : PostgreSQL (production) / SQLite (local).
 */
const path = require('path');
const fs = require('fs');
const { TRIBUS_DEFAUT, DEPARTEMENTS_DEFAUT } = require('./constants');

const DATABASE_URL = process.env.DATABASE_URL || '';
const engine = DATABASE_URL ? 'pg' : 'sqlite';

function tables(idAuto, horodatage, typeBinaire) {
  return {
    organisations: `CREATE TABLE IF NOT EXISTS organisations (
      id             ${idAuto},
      nom            TEXT NOT NULL,
      slug           TEXT NOT NULL UNIQUE,
      email          TEXT NOT NULL,
      telephone      TEXT DEFAULT '',
      adresse        TEXT DEFAULT '',
      logo           TEXT DEFAULT '',
      plan           TEXT NOT NULL DEFAULT 'essai',
      statut         TEXT NOT NULL DEFAULT 'essai',
      date_fin_essai TEXT,
      created_at     ${horodatage}
    )`,
    abonnements: `CREATE TABLE IF NOT EXISTS abonnements (
      id             ${idAuto},
      org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      plan           TEXT NOT NULL,
      montant        DOUBLE PRECISION NOT NULL DEFAULT 0,
      devise         TEXT NOT NULL DEFAULT 'FCFA',
      moyen_paiement TEXT DEFAULT '',
      reference_paiement TEXT DEFAULT '',
      date_debut     TEXT NOT NULL,
      date_fin       TEXT NOT NULL,
      statut         TEXT NOT NULL DEFAULT 'en_attente',
      created_at     ${horodatage}
    )`,
    super_admins: `CREATE TABLE IF NOT EXISTS super_admins (
      id             ${idAuto},
      email          TEXT NOT NULL UNIQUE,
      password_hash  TEXT NOT NULL,
      nom            TEXT NOT NULL DEFAULT 'Admin',
      created_at     ${horodatage}
    )`,
    tribus: `CREATE TABLE IF NOT EXISTS tribus (
      id            ${idAuto},
      org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      nom           TEXT NOT NULL,
      description   TEXT DEFAULT '',
      patriarche_id INTEGER,
      created_at    ${horodatage},
      UNIQUE(org_id, nom)
    )`,
    departements: `CREATE TABLE IF NOT EXISTS departements (
      id             ${idAuto},
      org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      nom            TEXT NOT NULL,
      description    TEXT DEFAULT '',
      responsable_id INTEGER,
      created_at     ${horodatage},
      UNIQUE(org_id, nom)
    )`,
    users: `CREATE TABLE IF NOT EXISTS users (
      id             ${idAuto},
      org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      nom            TEXT NOT NULL,
      prenom         TEXT NOT NULL,
      email          TEXT NOT NULL,
      telephone      TEXT DEFAULT '',
      whatsapp       TEXT DEFAULT '',
      date_naissance TEXT DEFAULT '',
      password_hash  TEXT NOT NULL,
      role           TEXT NOT NULL DEFAULT 'fidele',
      statut         TEXT NOT NULL DEFAULT 'en_attente',
      tribu_id       INTEGER REFERENCES tribus(id) ON DELETE SET NULL,
      tribu_souhaitee      TEXT DEFAULT '',
      departement_souhaite TEXT DEFAULT '',
      photo          TEXT,
      created_at     ${horodatage},
      UNIQUE(org_id, email)
    )`,
    membres_departements: `CREATE TABLE IF NOT EXISTS membres_departements (
      membre_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      departement_id INTEGER NOT NULL REFERENCES departements(id) ON DELETE CASCADE,
      PRIMARY KEY (membre_id, departement_id)
    )`,
    evenements: `CREATE TABLE IF NOT EXISTS evenements (
      id             ${idAuto},
      org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      type           TEXT NOT NULL,
      titre          TEXT NOT NULL,
      date           TEXT NOT NULL,
      portee         TEXT NOT NULL DEFAULT 'assemblee',
      tribu_id       INTEGER REFERENCES tribus(id) ON DELETE CASCADE,
      departement_id INTEGER REFERENCES departements(id) ON DELETE CASCADE,
      created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     ${horodatage}
    )`,
    presences: `CREATE TABLE IF NOT EXISTS presences (
      id           ${idAuto},
      evenement_id INTEGER NOT NULL REFERENCES evenements(id) ON DELETE CASCADE,
      membre_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      statut       TEXT NOT NULL,
      commentaire  TEXT DEFAULT '',
      pointe_par   INTEGER,
      UNIQUE (evenement_id, membre_id)
    )`,
    cotisations: `CREATE TABLE IF NOT EXISTS cotisations (
      id             ${idAuto},
      org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      membre_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      montant        DOUBLE PRECISION NOT NULL,
      libelle        TEXT DEFAULT '',
      date           TEXT NOT NULL,
      statut         TEXT NOT NULL DEFAULT 'non_paye',
      enregistre_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     ${horodatage}
    )`,
    demandes: `CREATE TABLE IF NOT EXISTS demandes (
      id         ${idAuto},
      org_id     INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      membre_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      contenu    TEXT NOT NULL,
      statut     TEXT NOT NULL DEFAULT 'nouveau',
      created_at ${horodatage}
    )`,
    annonces: `CREATE TABLE IF NOT EXISTS annonces (
      id             ${idAuto},
      org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      auteur_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      tribu_id       INTEGER REFERENCES tribus(id) ON DELETE SET NULL,
      departement_id INTEGER REFERENCES departements(id) ON DELETE SET NULL,
      titre          TEXT NOT NULL,
      contenu        TEXT NOT NULL,
      canal          TEXT NOT NULL DEFAULT 'whatsapp_lien',
      nb_destinataires INTEGER NOT NULL DEFAULT 0,
      created_at     ${horodatage}
    )`,
    comptages: `CREATE TABLE IF NOT EXISTS comptages (
      id             ${idAuto},
      evenement_id   INTEGER NOT NULL UNIQUE REFERENCES evenements(id) ON DELETE CASCADE,
      hommes         INTEGER NOT NULL DEFAULT 0,
      femmes         INTEGER NOT NULL DEFAULT 0,
      enfants        INTEGER NOT NULL DEFAULT 0,
      notes          TEXT DEFAULT '',
      saisi_par      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at     ${horodatage}
    )`,
    bilans_mensuels: `CREATE TABLE IF NOT EXISTS bilans_mensuels (
      id                 ${idAuto},
      org_id             INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      mois               TEXT NOT NULL,
      fideles_actifs     INTEGER NOT NULL DEFAULT 0,
      nouveaux_inscrits  INTEGER NOT NULL DEFAULT 0,
      nb_evenements      INTEGER NOT NULL DEFAULT 0,
      nb_cultes          INTEGER NOT NULL DEFAULT 0,
      nb_pointages       INTEGER NOT NULL DEFAULT 0,
      taux_presence      INTEGER,
      comptage_hommes    INTEGER NOT NULL DEFAULT 0,
      comptage_femmes    INTEGER NOT NULL DEFAULT 0,
      comptage_enfants   INTEGER NOT NULL DEFAULT 0,
      par_tribu          TEXT DEFAULT '[]',
      par_departement    TEXT DEFAULT '[]',
      saisi_par          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         ${horodatage},
      UNIQUE(org_id, mois)
    )`,
    parametres: `CREATE TABLE IF NOT EXISTS parametres (
      org_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      cle    TEXT NOT NULL,
      valeur TEXT,
      PRIMARY KEY (org_id, cle)
    )`,
    fichiers: `CREATE TABLE IF NOT EXISTS fichiers (
      org_id   INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      nom      TEXT NOT NULL,
      mime     TEXT NOT NULL,
      donnees  ${typeBinaire} NOT NULL,
      created_at ${horodatage},
      PRIMARY KEY (org_id, nom)
    )`,
    fiches_membres: `CREATE TABLE IF NOT EXISTS fiches_membres (
      id             ${idAuto},
      org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      nom            TEXT NOT NULL,
      prenom         TEXT NOT NULL,
      tribu          TEXT DEFAULT '',
      departement    TEXT DEFAULT '',
      adresse        TEXT DEFAULT '',
      date_naissance TEXT DEFAULT '',
      telephone      TEXT DEFAULT '',
      created_at     ${horodatage}
    )`,
  };
}

const ORDRE_TABLES = [
  'organisations', 'abonnements', 'super_admins',
  'tribus', 'departements', 'users', 'membres_departements',
  'evenements', 'presences', 'cotisations', 'demandes', 'annonces', 'comptages',
  'bilans_mensuels', 'parametres', 'fichiers', 'fiches_membres',
];

const INDEX = [
  'CREATE INDEX IF NOT EXISTS idx_users_org         ON users(org_id)',
  'CREATE INDEX IF NOT EXISTS idx_users_tribu        ON users(tribu_id)',
  'CREATE INDEX IF NOT EXISTS idx_users_role         ON users(role)',
  'CREATE INDEX IF NOT EXISTS idx_tribus_org         ON tribus(org_id)',
  'CREATE INDEX IF NOT EXISTS idx_departements_org   ON departements(org_id)',
  'CREATE INDEX IF NOT EXISTS idx_md_departement     ON membres_departements(departement_id)',
  'CREATE INDEX IF NOT EXISTS idx_evenements_org     ON evenements(org_id)',
  'CREATE INDEX IF NOT EXISTS idx_evenements_date    ON evenements(date)',
  'CREATE INDEX IF NOT EXISTS idx_evenements_tribu   ON evenements(tribu_id)',
  'CREATE INDEX IF NOT EXISTS idx_evenements_dept    ON evenements(departement_id)',
  'CREATE INDEX IF NOT EXISTS idx_presences_membre   ON presences(membre_id)',
  'CREATE INDEX IF NOT EXISTS idx_presences_ev       ON presences(evenement_id)',
  'CREATE INDEX IF NOT EXISTS idx_cotisations_org    ON cotisations(org_id)',
  'CREATE INDEX IF NOT EXISTS idx_cotisations_membre ON cotisations(membre_id)',
  'CREATE INDEX IF NOT EXISTS idx_demandes_org       ON demandes(org_id)',
  'CREATE INDEX IF NOT EXISTS idx_demandes_membre    ON demandes(membre_id)',
  'CREATE INDEX IF NOT EXISTS idx_comptages_ev       ON comptages(evenement_id)',
  'CREATE INDEX IF NOT EXISTS idx_abonnements_org    ON abonnements(org_id)',
];

let db;

if (engine === 'pg') {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, (v) => parseInt(v, 10));
  types.setTypeParser(1700, (v) => parseFloat(v));

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
  });

  function convertir(sql) {
    let n = 0;
    return sql.replace(/\?/g, () => `$${++n}`);
  }

  db = {
    engine,
    async all(sql, ...params) { return (await pool.query(convertir(sql), params)).rows; },
    async get(sql, ...params) { return (await pool.query(convertir(sql), params)).rows[0]; },
    async run(sql, ...params) { await pool.query(convertir(sql), params); },
    async insert(sql, ...params) {
      const r = await pool.query(convertir(sql) + ' RETURNING id', params);
      return r.rows[0].id;
    },
    async colonneExiste(table, colonne) {
      const r = await pool.query(
        'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
        [table, colonne]
      );
      return r.rowCount > 0;
    },
    async init() {
      const t = tables('SERIAL PRIMARY KEY', 'TIMESTAMPTZ NOT NULL DEFAULT now()', 'BYTEA');
      for (const nom of ORDRE_TABLES) await pool.query(t[nom]);
      for (const idx of INDEX) await pool.query(idx);
      console.log('Base PostgreSQL prete.');
    },
  };
} else {
  const Database = require('better-sqlite3');
  const isVercel = !!process.env.VERCEL;
  const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, 'zaura.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const T = tables('INTEGER PRIMARY KEY AUTOINCREMENT', "TEXT NOT NULL DEFAULT (datetime('now'))", 'BLOB');

  db = {
    engine,
    async all(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async get(sql, ...params) { return sqlite.prepare(sql).get(...params); },
    async run(sql, ...params) { sqlite.prepare(sql).run(...params); },
    async insert(sql, ...params) { return sqlite.prepare(sql).run(...params).lastInsertRowid; },
    async colonneExiste(table, colonne) {
      return sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name).includes(colonne);
    },
    async init() {
      for (const nom of ORDRE_TABLES) sqlite.exec(T[nom]);
      for (const idx of INDEX) sqlite.exec(idx);
      if (isVercel) console.log('SQLite en mode temporaire (/tmp). Les donnees ne persistent pas entre les redemarrages. Configurez DATABASE_URL pour PostgreSQL.');
      else console.log('Base SQLite prete (data/zaura.db).');
    },
  };
}

db.concatListe = (expr, sep) =>
  engine === 'pg' ? `string_agg(${expr}, '${sep}')` : `GROUP_CONCAT(${expr}, '${sep}')`;

db.placeholders = (n) => Array.from({ length: n }, () => '?').join(', ');

db.ajouterColonne = async function ajouterColonne(table, colonne, definition) {
  if (await db.colonneExiste(table, colonne)) return false;
  await db.run(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${definition}`);
  return true;
};

db.creerOrgAvecReferentiel = async function creerOrgAvecReferentiel(orgId, tribus, departements) {
  const tribusACreer = tribus && tribus.length ? tribus : TRIBUS_DEFAUT;
  const deptsACreer = departements && departements.length ? departements : DEPARTEMENTS_DEFAUT;
  for (const nom of tribusACreer) {
    const existe = await db.get('SELECT id FROM tribus WHERE org_id = ? AND nom = ?', orgId, nom);
    if (!existe) await db.run('INSERT INTO tribus (org_id, nom) VALUES (?, ?)', orgId, nom);
  }
  for (const nom of deptsACreer) {
    const existe = await db.get('SELECT id FROM departements WHERE org_id = ? AND nom = ?', orgId, nom);
    if (!existe) await db.run('INSERT INTO departements (org_id, nom) VALUES (?, ?)', orgId, nom);
  }
};

db.creerSuperAdmin = async function creerSuperAdmin() {
  const bcrypt = require('bcryptjs');
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@zaura.app';
  const pass = process.env.SUPER_ADMIN_PASSWORD || 'zaura2024';
  const existe = await db.get('SELECT id FROM super_admins WHERE email = ?', email);
  if (!existe) {
    const hash = bcrypt.hashSync(pass, 10);
    await db.insert('INSERT INTO super_admins (email, password_hash, nom) VALUES (?, ?, ?)',
      email, hash, 'Super Admin');
    console.log(`Super admin cree : ${email}`);
  }
};

module.exports = db;
