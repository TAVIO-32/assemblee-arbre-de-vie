/**
 * db.js — Couche d'accès à la base de données (double moteur).
 *
 *  - Si la variable DATABASE_URL est définie (ex. Render, Neon, Railway) :
 *    PostgreSQL — recommandé en production (données persistantes).
 *  - Sinon : SQLite dans data/arbre-de-vie.db — parfait en local, zéro configuration.
 *
 * Les routes utilisent une API asynchrone unique :
 *    await db.get(sql, ...params)     → une ligne (ou undefined)
 *    await db.all(sql, ...params)     → tableau de lignes
 *    await db.run(sql, ...params)     → exécution simple
 *    await db.insert(sql, ...params)  → id de la ligne insérée
 * Les requêtes s'écrivent avec des « ? » ; la conversion vers $1…$n
 * (PostgreSQL) est automatique.
 *
 * MODÈLE — Assemblée Arbre de Vie :
 *    tribus ─┬─< users (un fidèle appartient à UNE tribu)
 *            └─ patriarche_id → le conducteur de la tribu
 *    departements ─< membres_departements >─ users (plusieurs départements
 *            possibles par fidèle) ; responsable_id → le conducteur.
 *    evenements.portee (assemblee | tribu | departement) détermine la
 *    composition de la fiche de présence.
 *
 * NOTE : patriarche_id et responsable_id sont de simples entiers (pas de clé
 * étrangère) pour éviter une dépendance circulaire entre tribus et users ;
 * ils sont remis à NULL explicitement à la suppression d'un compte.
 */
const path = require('path');
const fs = require('fs');
const { TRIBUS, DEPARTEMENTS } = require('./constants');

const DATABASE_URL = process.env.DATABASE_URL || '';
const engine = DATABASE_URL ? 'pg' : 'sqlite';

/* ---------- Schéma commun (différences de dialecte isolées ici) ----------
 * Les contraintes CHECK sur les listes de valeurs (rôles, types, portées) ne
 * figurent volontairement PAS dans le schéma : elles évoluent avec le métier
 * et sont validées côté application (server/constants.js). Cela évite des
 * migrations de contraintes à chaque ajout de rôle ou de type d'événement. */
function tables(idAuto, horodatage, typeBinaire) {
  return {
    tribus: `CREATE TABLE IF NOT EXISTS tribus (
      id            ${idAuto},
      nom           TEXT NOT NULL UNIQUE,
      description   TEXT DEFAULT '',
      patriarche_id INTEGER,
      created_at    ${horodatage}
    )`,
    departements: `CREATE TABLE IF NOT EXISTS departements (
      id             ${idAuto},
      nom            TEXT NOT NULL UNIQUE,
      description    TEXT DEFAULT '',
      responsable_id INTEGER,
      created_at     ${horodatage}
    )`,
    users: `CREATE TABLE IF NOT EXISTS users (
      id             ${idAuto},
      nom            TEXT NOT NULL,
      prenom         TEXT NOT NULL,
      email          TEXT NOT NULL UNIQUE,
      telephone      TEXT DEFAULT '',
      whatsapp       TEXT DEFAULT '',
      date_naissance TEXT DEFAULT '',
      password_hash  TEXT NOT NULL,
      role           TEXT NOT NULL DEFAULT 'fidele',
      statut         TEXT NOT NULL DEFAULT 'en_attente',
      tribu_id       INTEGER REFERENCES tribus(id) ON DELETE SET NULL,
      tribu_souhaitee      TEXT DEFAULT '',
      departement_souhaite TEXT DEFAULT '',
      created_at     ${horodatage}
    )`,
    membres_departements: `CREATE TABLE IF NOT EXISTS membres_departements (
      membre_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      departement_id INTEGER NOT NULL REFERENCES departements(id) ON DELETE CASCADE,
      PRIMARY KEY (membre_id, departement_id)
    )`,
    evenements: `CREATE TABLE IF NOT EXISTS evenements (
      id             ${idAuto},
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
      membre_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      contenu    TEXT NOT NULL,
      statut     TEXT NOT NULL DEFAULT 'nouveau',
      created_at ${horodatage}
    )`,
    annonces: `CREATE TABLE IF NOT EXISTS annonces (
      id             ${idAuto},
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
      mois               TEXT NOT NULL UNIQUE,
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
      created_at         ${horodatage}
    )`,
    parametres: `CREATE TABLE IF NOT EXISTS parametres (
      cle    TEXT PRIMARY KEY,
      valeur TEXT
    )`,
    fichiers: `CREATE TABLE IF NOT EXISTS fichiers (
      nom      TEXT PRIMARY KEY,
      mime     TEXT NOT NULL,
      donnees  ${typeBinaire} NOT NULL,
      created_at ${horodatage}
    )`,
    fiches_membres: `CREATE TABLE IF NOT EXISTS fiches_membres (
      id             ${idAuto},
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

// Ordre de création : les tables référencées d'abord.
const ORDRE_TABLES = [
  'tribus', 'departements', 'users', 'membres_departements',
  'evenements', 'presences', 'cotisations', 'demandes', 'annonces', 'comptages',
  'bilans_mensuels', 'parametres', 'fichiers', 'fiches_membres',
];

const INDEX = [
  'CREATE INDEX IF NOT EXISTS idx_users_tribu       ON users(tribu_id)',
  'CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role)',
  'CREATE INDEX IF NOT EXISTS idx_md_departement    ON membres_departements(departement_id)',
  'CREATE INDEX IF NOT EXISTS idx_evenements_date   ON evenements(date)',
  'CREATE INDEX IF NOT EXISTS idx_evenements_tribu  ON evenements(tribu_id)',
  'CREATE INDEX IF NOT EXISTS idx_evenements_dept   ON evenements(departement_id)',
  'CREATE INDEX IF NOT EXISTS idx_presences_membre  ON presences(membre_id)',
  'CREATE INDEX IF NOT EXISTS idx_presences_ev      ON presences(evenement_id)',
  'CREATE INDEX IF NOT EXISTS idx_cotisations_membre ON cotisations(membre_id)',
  'CREATE INDEX IF NOT EXISTS idx_demandes_membre   ON demandes(membre_id)',
  'CREATE INDEX IF NOT EXISTS idx_comptages_ev      ON comptages(evenement_id)',
];

let db; // objet exporté

if (engine === 'pg') {
  /* ==================== PostgreSQL (production) ==================== */
  const { Pool, types } = require('pg');
  // COUNT()/SUM() renvoient des chaînes par défaut : on les convertit en nombres.
  types.setTypeParser(20, (v) => parseInt(v, 10));     // int8
  types.setTypeParser(1700, (v) => parseFloat(v));     // numeric

  const pool = new Pool({
    connectionString: DATABASE_URL,
    // Les hébergeurs (Render, Neon…) exigent SSL ; inutile en local.
    ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
  });

  /** Convertit les « ? » en $1, $2… (syntaxe PostgreSQL). */
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
    /** Supprime les contraintes CHECK héritées de l'ancien modèle (rôles, types). */
    async libererContraintes() {
      for (const c of ['users_role_check', 'users_statut_check', 'evenements_type_check',
                       'presences_statut_check', 'cotisations_statut_check',
                       'demandes_type_check', 'demandes_statut_check']) {
        const table = c.split('_')[0];
        await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${c}`);
      }
    },
    async init() {
      const t = tables('SERIAL PRIMARY KEY', 'TIMESTAMPTZ NOT NULL DEFAULT now()', 'BYTEA');
      for (const nom of ORDRE_TABLES) await pool.query(t[nom]);
      console.log('🐘 Base PostgreSQL prête.');
    },
    async creerIndex() {
      for (const idx of INDEX) await pool.query(idx);
    },
  };
} else {
  /* ==================== SQLite (développement local) ==================== */
  const Database = require('better-sqlite3');
  const DATA_DIR = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, 'arbre-de-vie.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const T = tables('INTEGER PRIMARY KEY AUTOINCREMENT', "TEXT NOT NULL DEFAULT (datetime('now'))", 'BLOB');

  function colonnes(table) {
    return sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  }

  db = {
    engine,
    async all(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async get(sql, ...params) { return sqlite.prepare(sql).get(...params); },
    async run(sql, ...params) { sqlite.prepare(sql).run(...params); },
    async insert(sql, ...params) { return sqlite.prepare(sql).run(...params).lastInsertRowid; },
    async colonneExiste(table, colonne) { return colonnes(table).includes(colonne); },
    /**
     * SQLite ne sait pas supprimer une contrainte CHECK : on reconstruit la
     * table à partir du schéma courant en recopiant les colonnes communes.
     */
    async libererContraintes() {
      for (const nom of ['users', 'evenements']) {
        const ligne = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(nom);
        if (!ligne || !/CHECK\s*\(\s*\w+\s+IN/i.test(ligne.sql)) continue;

        const anciennes = colonnes(nom);
        sqlite.pragma('foreign_keys = OFF');
        // Sans ce mode, SQLite ≥ 3.25 réécrit les clauses REFERENCES des autres
        // tables pour pointer vers « <nom>_ancien » lors du renommage.
        sqlite.pragma('legacy_alter_table = ON');
        sqlite.exec('BEGIN');
        try {
          sqlite.exec(`ALTER TABLE ${nom} RENAME TO ${nom}_ancien`);
          sqlite.exec(T[nom]);
          const communes = colonnes(nom).filter((c) => anciennes.includes(c));
          sqlite.exec(
            `INSERT INTO ${nom} (${communes.join(', ')}) SELECT ${communes.join(', ')} FROM ${nom}_ancien`
          );
          sqlite.exec(`DROP TABLE ${nom}_ancien`);
          sqlite.exec('COMMIT');
          console.log(`   ↻ table ${nom} reconstruite (contraintes obsolètes retirées).`);
        } catch (err) {
          sqlite.exec('ROLLBACK');
          throw err;
        } finally {
          sqlite.pragma('legacy_alter_table = OFF');
          sqlite.pragma('foreign_keys = ON');
        }
      }
    },
    async init() {
      for (const nom of ORDRE_TABLES) sqlite.exec(T[nom]);
      console.log('🗄️  Base SQLite prête (data/arbre-de-vie.db).');
    },
    async creerIndex() {
      for (const idx of INDEX) sqlite.exec(idx);
    },
  };
}

/** Fragment SQL de concaténation de liste, différent selon le moteur. */
db.concatListe = (expr, sep) =>
  engine === 'pg' ? `string_agg(${expr}, '${sep}')` : `GROUP_CONCAT(${expr}, '${sep}')`;

/** Liste de « ? » pour une clause IN (...). */
db.placeholders = (n) => Array.from({ length: n }, () => '?').join(', ');

/** Ajoute une colonne si elle n'existe pas encore (migration douce). */
db.ajouterColonne = async function ajouterColonne(table, colonne, definition) {
  if (await db.colonneExiste(table, colonne)) return false;
  await db.run(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${definition}`);
  console.log(`   + colonne ${table}.${colonne}`);
  return true;
};

/**
 * Migration depuis l'ancien modèle (rôles pasteur/leader/membre, un seul
 * département par membre) vers le modèle Arbre de Vie. Idempotente : elle peut
 * être rejouée à chaque démarrage sans effet de bord.
 */
db.migrer = async function migrer() {
  // 1. Colonnes ajoutées après coup sur des bases déjà déployées.
  await db.ajouterColonne('tribus', 'patriarche_id', 'INTEGER');
  await db.ajouterColonne('departements', 'responsable_id', 'INTEGER');
  await db.ajouterColonne('users', 'tribu_id', 'INTEGER');
  await db.ajouterColonne('users', 'tribu_souhaitee', "TEXT DEFAULT ''");
  await db.ajouterColonne('evenements', 'portee', "TEXT NOT NULL DEFAULT 'assemblee'");
  await db.ajouterColonne('evenements', 'tribu_id', 'INTEGER');
  await db.ajouterColonne('presences', 'commentaire', "TEXT DEFAULT ''");
  await db.ajouterColonne('presences', 'pointe_par', 'INTEGER');
  await db.ajouterColonne('annonces', 'tribu_id', 'INTEGER');
  await db.ajouterColonne('users', 'photo', 'TEXT');

  // 2. Reprise des affectations « un seul département » vers la table de liaison.
  if (await db.colonneExiste('users', 'departement_id')) {
    await db.run(`
      INSERT INTO membres_departements (membre_id, departement_id)
      SELECT u.id, u.departement_id FROM users u
      WHERE u.departement_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM departements d WHERE d.id = u.departement_id)
        AND NOT EXISTS (SELECT 1 FROM membres_departements m
                        WHERE m.membre_id = u.id AND m.departement_id = u.departement_id)
    `);
    // Les anciens événements étaient tous rattachés à un département.
    await db.run("UPDATE evenements SET portee = 'departement' WHERE departement_id IS NOT NULL AND portee = 'assemblee'");
  }

  // 3. Retrait des contraintes CHECK obsolètes (rôles, types d'événements) :
  //    impérativement AVANT d'écrire les nouvelles valeurs. En SQLite, cette
  //    étape reconstruit les tables et fait disparaître la colonne héritée
  //    users.departement_id — d'où sa reprise à l'étape 2.
  await db.libererContraintes();

  // 4. Correspondance des anciens rôles vers la hiérarchie Arbre de Vie.
  const anciens = [['membre', 'fidele'], ['leader', 'responsable_departement'], ['pasteur', 'pasteur_assistant']];
  for (const [avant, apres] of anciens) {
    await db.run('UPDATE users SET role = ? WHERE role = ?', apres, avant);
  }

  // 5. Il faut toujours exactement un Pasteur Principal si des comptes existent.
  const principal = await db.get("SELECT id FROM users WHERE role = 'pasteur_principal' LIMIT 1");
  if (!principal) {
    const doyen = await db.get(`
      SELECT id FROM users
      WHERE statut = 'actif' AND role IN ('pasteur_assistant', 'assistant_pasteur')
      ORDER BY id LIMIT 1
    `);
    if (doyen) {
      await db.run("UPDATE users SET role = 'pasteur_principal' WHERE id = ?", doyen.id);
      console.log('   ↑ compte #' + doyen.id + ' promu Pasteur Principal.');
    }
  }

  // 6. Amorçage du référentiel : les 6 tribus et les 13 départements.
  await db.amorcerReferentiel();

  // 7. Cohérence : les patriarches / responsables désignés doivent exister.
  await db.run('UPDATE tribus SET patriarche_id = NULL WHERE patriarche_id IS NOT NULL AND patriarche_id NOT IN (SELECT id FROM users)');
  await db.run('UPDATE departements SET responsable_id = NULL WHERE responsable_id IS NOT NULL AND responsable_id NOT IN (SELECT id FROM users)');

  // 8. Index en dernier : les colonnes indexées viennent d'être ajoutées, et la
  //    reconstruction des tables SQLite (étape 4) supprime leurs index.
  await db.creerIndex();
};

/**
 * Insère les tribus et départements officiels manquants.
 * Appelée au démarrage (uniquement si la table est vide, pour ne pas
 * ressusciter une entrée volontairement supprimée) et à la demande depuis
 * l'interface du Pasteur Principal.
 */
db.amorcerReferentiel = async function amorcerReferentiel(forcer = false) {
  const ajouts = { tribus: 0, departements: 0 };

  const nbTribus = (await db.get('SELECT COUNT(*) AS n FROM tribus')).n;
  if (forcer || nbTribus === 0) {
    for (const nom of TRIBUS) {
      const existe = await db.get('SELECT id FROM tribus WHERE nom = ?', nom);
      if (!existe) { await db.run('INSERT INTO tribus (nom) VALUES (?)', nom); ajouts.tribus++; }
    }
  }

  const nbDepts = (await db.get('SELECT COUNT(*) AS n FROM departements')).n;
  if (forcer || nbDepts === 0) {
    for (const nom of DEPARTEMENTS) {
      const existe = await db.get('SELECT id FROM departements WHERE nom = ?', nom);
      if (!existe) { await db.run('INSERT INTO departements (nom) VALUES (?)', nom); ajouts.departements++; }
    }
  }

  if (ajouts.tribus || ajouts.departements) {
    console.log(`   ✦ référentiel : ${ajouts.tribus} tribu(s), ${ajouts.departements} département(s) ajouté(s).`);
  }
  return ajouts;
};

module.exports = db;
