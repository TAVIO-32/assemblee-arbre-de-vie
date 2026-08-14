/**
 * app.js — Routeur et démarrage de l'application.
 *
 * Les vues sont définies dans core.js, vues-direction.js, vues-equipe.js et
 * vues-membre.js. Ce fichier associe chaque ancre (#/…) à une vue et vérifie
 * qu'elle correspond au périmètre de l'utilisateur — le contrôle d'accès
 * effectif restant appliqué côté serveur.
 */

/** Qui peut voir quoi : `acces` reçoit l'utilisateur connecté. */
const ROUTES = [
  {
    motif: /^#\/accueil$/,
    nav: '#/accueil',
    acces: () => true,
    vue: (v) => estDirection() ? vueAccueilDirection(v)
      : estEncadrant() ? vueAccueilEncadrant(v)
      : vueAccueilFidele(v),
  },
  { motif: /^#\/validations$/,        nav: '#/validations',   acces: estDirection, vue: vueValidations },
  { motif: /^#\/statistiques$/,       nav: '#/statistiques',  acces: estDirection, vue: vueStatistiques },
  { motif: /^#\/evolution$/,          nav: '#/evolution',     acces: estDirection, vue: vueEvolution },
  { motif: /^#\/fideles$/,            nav: '#/fideles',       acces: estEncadrant, vue: vueFideles },
  { motif: /^#\/fideles\/(\d+)$/,     nav: '#/fideles',       acces: estEncadrant, vue: vueFicheFidele },
  { motif: /^#\/tribus$/,             nav: '#/tribus',        acces: estDirection, vue: vueTribus },
  { motif: /^#\/tribus\/(\d+)$/,      nav: null,              acces: () => true,   vue: vueTribu },
  { motif: /^#\/departements$/,       nav: '#/departements',  acces: estDirection, vue: vueDepartements },
  { motif: /^#\/departements\/(\d+)$/, nav: null,             acces: () => true,   vue: vueDepartement },
  { motif: /^#\/presences$/,          nav: '#/presences',     acces: estEncadrant, vue: vuePresences },
  { motif: /^#\/presences\/(\d+)$/,   nav: '#/presences',     acces: estEncadrant, vue: vueFichePresence },
  { motif: /^#\/cotisations$/,        nav: '#/cotisations',   acces: estEncadrant, vue: vueCotisations },
  { motif: /^#\/demandes$/,           nav: '#/demandes',      acces: estEncadrant, vue: vueDemandesResponsable },
  { motif: /^#\/annonces$/,           nav: '#/annonces',      acces: estEncadrant, vue: vueAnnonces },
  { motif: /^#\/qrcode$/,             nav: '#/qrcode',        acces: estDirection, vue: vueQRCode },
  { motif: /^#\/fiches$/,             nav: '#/fiches',        acces: estDirection, vue: vueFiches },
  { motif: /^#\/versets$/,            nav: '#/versets',       acces: estDirection, vue: vueVersets },
  { motif: /^#\/mes-presences$/,      nav: '#/mes-presences', acces: () => true,   vue: vueMesPresences },
  { motif: /^#\/mes-cotisations$/,    nav: '#/mes-cotisations', acces: () => true, vue: vueMesCotisations },
  { motif: /^#\/mes-demandes$/,       nav: '#/mes-demandes',  acces: () => true,   vue: vueMesDemandes },
  { motif: /^#\/profil$/,             nav: '#/profil',        acces: () => true,   vue: vueProfil },
];

async function router() {
  if (!etat.user) return afficherAuth();

  const ancre = location.hash || '#/accueil';
  let route = ROUTES.find((r) => r.motif.test(ancre) && r.acces(etat.user));
  let params = [];

  if (route) {
    params = ancre.match(route.motif).slice(1);
  } else {
    route = ROUTES[0];   // repli sur l'accueil
    location.hash = '#/accueil';
  }

  // Une ancre dynamique (fiche, tribu…) met en évidence l'entrée de menu parente
  // si elle existe, sinon l'ancre elle-même quand elle figure dans la navigation.
  const vue = coquille(route.nav === null ? ancre : route.nav);
  try {
    await route.vue(vue, ...params);
  } catch (err) {
    if (err.status === 401) { etat.user = null; return afficherAuth(); }
    vue.innerHTML = `<div class="encart-alerte">${esc(err.message)}</div>
      <a class="btn btn-petit btn-secondaire" href="#/accueil">Retour à l'accueil</a>`;
  }
}

window.addEventListener('hashchange', router);

/** Démarrage : session existante ? sinon écran de connexion. */
(async function demarrer() {
  try {
    await rafraichirSession();
    if (!location.hash) location.hash = '#/accueil';
    await router();
  } catch {
    await afficherAuth();
  }
})();
