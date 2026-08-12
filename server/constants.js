/**
 * constants.js — Référentiel métier de l'Assemblée Arbre de Vie.
 *
 * Source unique de vérité pour les rôles, la hiérarchie, les tribus et les
 * départements. Le serveur valide toutes les entrées contre ces listes ;
 * l'interface les récupère via GET /api/referentiel (aucune duplication).
 */

/**
 * Hiérarchie pastorale. Le « niveau » ordonne l'autorité :
 *   Pasteur Principal > Pasteur Assistant > Assistant Pasteur > Patriarche
 * Un responsable ne peut jamais attribuer un rôle de niveau supérieur ou égal
 * au sien (seul le Pasteur Principal échappe à cette règle).
 */
const ROLES = {
  pasteur_principal: {
    libelle: 'Pasteur Principal',
    niveau: 100,
    description: "Autorité maximale : supervise toute l'assemblée, les tribus et les départements.",
  },
  pasteur_assistant: {
    libelle: 'Pasteur Assistant',
    niveau: 80,
    description: 'Seconde le Pasteur Principal sur la conduite générale de l\'assemblée.',
  },
  assistant_pasteur: {
    libelle: 'Assistant Pasteur',
    niveau: 60,
    description: 'Appuie le corps pastoral et suit les tribus et départements.',
  },
  patriarche: {
    libelle: 'Patriarche',
    niveau: 40,
    description: 'Conduit une tribu : présences, suivi et accompagnement de ses fidèles.',
  },
  responsable_departement: {
    libelle: 'Responsable de département',
    niveau: 30,
    description: 'Conduit un département : présences et suivi de ses membres.',
  },
  fidele: {
    libelle: 'Fidèle',
    niveau: 10,
    description: "Membre de l'assemblée, rattaché à une tribu et à un ou plusieurs départements.",
  },
};

const CODES_ROLES = Object.keys(ROLES);

/** Corps pastoral : périmètre global sur toute l'assemblée. */
const ROLES_DIRECTION = ['pasteur_principal', 'pasteur_assistant', 'assistant_pasteur'];

/** Rôles disposant d'une feuille de présence et d'un tableau de bord d'équipe. */
const ROLES_ENCADREMENT = [...ROLES_DIRECTION, 'patriarche', 'responsable_departement'];

/** Les 6 tribus de l'assemblée (ordre d'affichage). */
const TRIBUS = ['SIMGAD', 'LEVASE', 'RUDAN', 'JUNEPH', 'JOZABU', 'BENISSII'];

/** Les 13 départements de l'assemblée (ordre d'affichage). */
const DEPARTEMENTS = [
  'COM',
  'MRES',
  'ADN',
  'EVANGELISATION',
  'SAINTE SCENE',
  'GROUPE DE LOUANGE',
  'ECODIM',
  'PORTIER',
  'GESTION DE CULTE',
  'PROTOCOLE',
  "MEDECINE D'HONNEUR",
  'SOCIAL',
  'INTERCESSION',
];

/** Types d'événements pouvant faire l'objet d'une fiche de présence. */
const TYPES_EVENEMENT = {
  culte: 'Culte',
  reunion: 'Réunion',
  priere: 'Prière',
  veillee: 'Veillée',
  repetition: 'Répétition',
  formation: 'Formation',
  evangelisation: 'Évangélisation',
  activite: 'Activité',
};

/**
 * Portée d'un événement — détermine qui figure sur la fiche de présence :
 *   assemblee    → tous les fidèles actifs
 *   tribu        → les fidèles d'une tribu
 *   departement  → les membres affectés à un département
 */
const PORTEES = {
  assemblee: "Toute l'assemblée",
  tribu: 'Une tribu',
  departement: 'Un département',
};

/** Statuts de pointage — vert / rouge / orange dans l'interface. */
const STATUTS_PRESENCE = {
  present: 'Présent',
  absent: 'Absent',
  excuse: 'Excusé',
};

const STATUTS_COMPTE = ['en_attente', 'actif', 'rejete'];

const TYPES_DEMANDE = {
  priere: 'Sujet de prière',
  preoccupation: 'Préoccupation',
  besoin: 'Besoin',
  autre: 'Autre demande',
};

const STATUTS_DEMANDE = { nouveau: 'Nouveau', en_cours: 'En cours', traite: 'Traité' };

/** Niveau d'autorité d'un rôle (0 si le rôle est inconnu). */
function niveauRole(role) {
  return ROLES[role] ? ROLES[role].niveau : 0;
}

module.exports = {
  ROLES,
  CODES_ROLES,
  ROLES_DIRECTION,
  ROLES_ENCADREMENT,
  TRIBUS,
  DEPARTEMENTS,
  TYPES_EVENEMENT,
  PORTEES,
  STATUTS_PRESENCE,
  STATUTS_COMPTE,
  TYPES_DEMANDE,
  STATUTS_DEMANDE,
  niveauRole,
};
