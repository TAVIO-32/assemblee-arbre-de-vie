/**
 * routes/referentiel.js — Referentiel metier expose a l'interface (ZAURA).
 */
const express = require('express');
const {
  ROLES, CODES_ROLES, ROLES_DIRECTION, ROLES_ENCADREMENT,
  TYPES_EVENEMENT, PORTEES, STATUTS_PRESENCE, TYPES_DEMANDE, STATUTS_DEMANDE,
  PLANS, STATUTS_ORG, MOYENS_PAIEMENT,
} = require('../constants');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    roles: ROLES,
    ordre_roles: CODES_ROLES,
    roles_direction: ROLES_DIRECTION,
    roles_encadrement: ROLES_ENCADREMENT,
    types_evenement: TYPES_EVENEMENT,
    portees: PORTEES,
    statuts_presence: STATUTS_PRESENCE,
    types_demande: TYPES_DEMANDE,
    statuts_demande: STATUTS_DEMANDE,
    plans: PLANS,
    statuts_org: STATUTS_ORG,
    moyens_paiement: MOYENS_PAIEMENT,
  });
});

module.exports = router;
