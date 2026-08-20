/**
 * constants.js — Referentiel metier ZAURA.
 *
 * Plateforme SaaS multi-eglise : chaque organisation definit ses propres
 * tribus et departements, mais les roles et la hierarchie sont communs.
 */

const ROLES = {
  pasteur_principal: {
    libelle: 'Pasteur Principal',
    niveau: 100,
    description: "Autorite maximale : supervise toute l'assemblee, les tribus et les departements.",
  },
  pasteur_assistant: {
    libelle: 'Pasteur Assistant',
    niveau: 80,
    description: "Seconde le Pasteur Principal sur la conduite generale de l'assemblee.",
  },
  assistant_pasteur: {
    libelle: 'Assistant Pasteur',
    niveau: 60,
    description: 'Appuie le corps pastoral et suit les tribus et departements.',
  },
  patriarche: {
    libelle: 'Patriarche',
    niveau: 40,
    description: 'Conduit une tribu : presences, suivi et accompagnement de ses fideles.',
  },
  responsable_departement: {
    libelle: 'Responsable de departement',
    niveau: 30,
    description: 'Conduit un departement : presences et suivi de ses membres.',
  },
  fidele: {
    libelle: 'Fidele',
    niveau: 10,
    description: "Membre de l'assemblee, rattache a une tribu et a un ou plusieurs departements.",
  },
};

const CODES_ROLES = Object.keys(ROLES);
const ROLES_DIRECTION = ['pasteur_principal', 'pasteur_assistant', 'assistant_pasteur'];
const ROLES_ENCADREMENT = [...ROLES_DIRECTION, 'patriarche', 'responsable_departement'];

const TRIBUS_DEFAUT = ['SIMGAD', 'LEVASE', 'RUDAN', 'JUNEPH', 'JOZABU', 'BENISSII'];

const DEPARTEMENTS_DEFAUT = [
  'COM', 'MRES', 'ADN', 'EVANGELISATION', 'SAINTE SCENE',
  'GROUPE DE LOUANGE', 'ECODIM', 'PORTIER', 'GESTION DE CULTE',
  'PROTOCOLE', "MEDECINE D'HONNEUR", 'SOCIAL', 'INTERCESSION',
];

const TYPES_EVENEMENT = {
  culte: 'Culte', reunion: 'Reunion', priere: 'Priere',
  veillee: 'Veillee', repetition: 'Repetition', formation: 'Formation',
  evangelisation: 'Evangelisation', activite: 'Activite',
};

const PORTEES = {
  assemblee: "Toute l'assemblee",
  tribu: 'Une tribu',
  departement: 'Un departement',
};

const STATUTS_PRESENCE = { present: 'Present', absent: 'Absent', excuse: 'Excuse' };
const STATUTS_COMPTE = ['en_attente', 'actif', 'rejete'];
const TYPES_DEMANDE = {
  priere: 'Sujet de priere', preoccupation: 'Preoccupation',
  besoin: 'Besoin', autre: 'Autre demande',
};
const STATUTS_DEMANDE = { nouveau: 'Nouveau', en_cours: 'En cours', traite: 'Traite' };

const PLANS = {
  essai: { libelle: 'Essai gratuit', duree_jours: 3, prix_mensuel: 0, prix_annuel: 0 },
  mensuel: { libelle: 'Mensuel', prix: 5000, devise: 'FCFA' },
  annuel: { libelle: 'Annuel', prix: 50000, devise: 'FCFA', economie: '2 mois offerts' },
};

const STATUTS_ORG = ['essai', 'actif', 'suspendu', 'expire'];
const MOYENS_PAIEMENT = ['wave', 'orange_money', 'mtn_money'];

function niveauRole(role) {
  return ROLES[role] ? ROLES[role].niveau : 0;
}

module.exports = {
  ROLES, CODES_ROLES, ROLES_DIRECTION, ROLES_ENCADREMENT,
  TRIBUS_DEFAUT, DEPARTEMENTS_DEFAUT,
  TYPES_EVENEMENT, PORTEES, STATUTS_PRESENCE, STATUTS_COMPTE,
  TYPES_DEMANDE, STATUTS_DEMANDE,
  PLANS, STATUTS_ORG, MOYENS_PAIEMENT,
  niveauRole,
};
