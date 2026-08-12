/**
 * routes/referentiel.js — Référentiel métier exposé à l'interface.
 * Évite de dupliquer les rôles, types et libellés côté navigateur :
 * server/constants.js reste la source unique de vérité.
 */
const express = require('express');
const {
  ROLES, CODES_ROLES, ROLES_DIRECTION, ROLES_ENCADREMENT,
  TYPES_EVENEMENT, PORTEES, STATUTS_PRESENCE, TYPES_DEMANDE, STATUTS_DEMANDE,
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
  });
});

module.exports = router;
