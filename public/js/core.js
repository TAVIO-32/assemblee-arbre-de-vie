/**
 * core.js — Socle de l'application Assemblée Arbre de Vie.
 *
 *   1. État global et utilitaires
 *   2. Référentiel (rôles, types…) chargé depuis le serveur
 *   3. Composants d'affichage (badges, jauges, barres, colonnes)
 *   4. Coquille : entête + navigation selon le périmètre
 *   5. Écran d'authentification
 *
 * NOTE SÉCURITÉ : l'interface ne fait que refléter les droits ; le vrai
 * contrôle d'accès est appliqué côté serveur sur chaque route de l'API.
 */

/* ============ 1. État global et utilitaires ============ */

const etat = {
  user: null,          // utilisateur connecté (avec tribu, départements, périmètre)
  ref: null,           // référentiel métier (/api/referentiel)
  tribus: [],          // cache des tribus
  departements: [],    // cache des départements
  logoUrl: null,       // URL du logo personnalisé (null = emoji par défaut)
};

/** Échappe le HTML pour éviter toute injection dans les gabarits. */
function esc(valeur) {
  return String(valeur ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Petite notification en bas d'écran. */
function toast(message, estErreur = false) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className = 'visible' + (estErreur ? ' erreur' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3500);
}

/** Date AAAA-MM-JJ → JJ/MM/AAAA (affichage français). */
function dateFr(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return j && m && a ? `${j}/${m}/${a}` : iso;
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                     'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 2026-07 » → « juil. 26 ». */
function moisFr(aaaaMm) {
  const [a, m] = String(aaaaMm || '').split('-');
  const i = Number(m) - 1;
  return MOIS_COURTS[i] ? `${MOIS_COURTS[i]} ${String(a).slice(2)}` : aaaaMm;
}

/** Date du jour au format AAAA-MM-JJ (fuseau local). */
function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Nombre lisible (séparateur d'espace insécable). */
function nombre(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

/** Pourcentage ou tiret si aucune donnée. */
function pourcent(taux) {
  return taux === null || taux === undefined ? '—' : taux + '%';
}

/* ============ 2. Référentiel et caches ============ */

async function chargerReferentiel() {
  if (!etat.ref) etat.ref = await api.get('/referentiel');
  return etat.ref;
}
async function chargerTribus() {
  etat.tribus = (await api.get('/tribus')).tribus;
  return etat.tribus;
}
async function chargerDepartements() {
  etat.departements = (await api.get('/departements')).departements;
  return etat.departements;
}

function libelleRole(code) {
  return etat.ref && etat.ref.roles[code] ? etat.ref.roles[code].libelle : code;
}
function niveauRole(code) {
  return etat.ref && etat.ref.roles[code] ? etat.ref.roles[code].niveau : 0;
}
function estDirection(user = etat.user) {
  return !!(user && user.perimetre && user.perimetre.tout);
}
/** L'utilisateur conduit-il au moins une équipe (tribu ou département) ? */
function estEncadrant(user = etat.user) {
  if (!user || !user.perimetre) return false;
  return user.perimetre.tout
    || user.perimetre.tribus.length > 0
    || user.perimetre.departements.length > 0;
}

/** Options <select> génériques à partir d'une liste { id, nom }. */
function urlPhoto(nomFichier) {
  return nomFichier ? `/api/uploads/${nomFichier}` : null;
}

function avatarHtml(photo, prenom, nom, taille = 40) {
  if (photo) {
    return `<img class="avatar" src="${urlPhoto(photo)}" alt="${esc(prenom)}" style="width:${taille}px;height:${taille}px">`;
  }
  const initiales = (String(prenom)[0] || '') + (String(nom)[0] || '');
  return `<span class="avatar avatar-initiales" style="width:${taille}px;height:${taille}px;font-size:${Math.round(taille * 0.4)}px">${esc(initiales.toUpperCase())}</span>`;
}

function options(liste, selectionne, vide = '') {
  return (vide ? `<option value="">${esc(vide)}</option>` : '') +
    liste.map((o) => `<option value="${o.id}" ${Number(selectionne) === o.id ? 'selected' : ''}>${esc(o.nom)}</option>`).join('');
}

/** Options de rôles limitées à ce que l'utilisateur peut attribuer. */
function optionsRoles(selectionne) {
  const monNiveau = niveauRole(etat.user.role);
  const principal = etat.user.role === 'pasteur_principal';
  return etat.ref.ordre_roles
    .filter((code) => principal || niveauRole(code) < monNiveau)
    .map((code) => `<option value="${code}" ${selectionne === code ? 'selected' : ''}>${esc(libelleRole(code))}</option>`)
    .join('');
}

/* ============ 3. Composants d'affichage ============ */

/** Badge du rôle, teinté selon la place dans la hiérarchie. */
function badgeRole(code) {
  const n = niveauRole(code);
  const classe = n >= 60 ? 'badge-teal' : n >= 30 ? 'badge-or' : 'badge-gris';
  return `<span class="badge ${classe}">${esc(libelleRole(code))}</span>`;
}

/** Badge de pointage : couleur + icône + libellé (jamais la couleur seule). */
const ICONES_PRESENCE = { present: '✓', absent: '✕', excuse: '~' };
function badgePresence(statut) {
  if (!statut) return '<span class="badge badge-gris">Non pointé</span>';
  const classe = statut === 'present' ? 'badge-vert' : statut === 'absent' ? 'badge-rouge' : 'badge-ambre';
  const libelle = etat.ref ? etat.ref.statuts_presence[statut] : statut;
  return `<span class="badge ${classe}">${ICONES_PRESENCE[statut] || ''} ${esc(libelle)}</span>`;
}

/**
 * Jauge de taux de présence : barre de magnitude + valeur toujours écrite.
 * Le seuil colore la barre (rouge < 50 %, ambre < 75 %, vert au-delà) ; le
 * pourcentage reste lisible sans la couleur.
 */
function jauge(taux) {
  if (taux === null || taux === undefined) {
    return '<span class="badge badge-gris">Aucun pointage</span>';
  }
  const classe = taux < 50 ? 'basse' : taux < 75 ? 'moyenne' : 'haute';
  return `<div class="jauge-ligne">
    <div class="jauge ${classe}" title="${taux}% de présence"><div style="width:${taux}%"></div></div>
    <span class="jauge-valeur">${taux}%</span>
  </div>`;
}

/**
 * Barres de répartition (une seule teinte : c'est une magnitude, pas une
 * identité). `lignes` : [{ etiquette, valeur, appoint? }]
 */
function barres(lignes) {
  if (!lignes.length) return '<p class="message-vide">Aucune donnée.</p>';
  const max = Math.max(...lignes.map((l) => l.valeur), 1);
  return `<div class="barres">${lignes.map((l) => `
    <div class="barre-ligne">
      <span class="etiquette" title="${esc(l.etiquette)}">${esc(l.etiquette)}</span>
      <div class="barre-piste" title="${esc(l.etiquette)} : ${nombre(l.valeur)}">
        ${l.valeur > 0 ? `<div style="width:${Math.round((l.valeur / max) * 100)}%"></div>` : ''}
      </div>
      <span class="mesure">${nombre(l.valeur)}${l.appoint ? `<small> ${esc(l.appoint)}</small>` : ''}</span>
    </div>`).join('')}</div>`;
}

/**
 * Colonnes d'évolution mensuelle du taux de présence.
 * Série unique → pas de légende ; le titre de la section la nomme.
 */
function colonnesEvolution(evolution) {
  if (!evolution || !evolution.length) {
    return '<p class="message-vide">Pas encore assez de pointages pour tracer une évolution.</p>';
  }
  return `
    <div class="colonnes">
      ${evolution.map((e) => `
        <div class="colonne" title="${moisFr(e.mois)} : ${e.taux}% de présence sur ${e.total} pointage(s)">
          <span class="val">${e.taux}%</span>
          <div class="tige ${e.total ? '' : 'vide'}" style="height:${Math.max(e.taux, 1)}%"></div>
        </div>`).join('')}
    </div>
    <div class="axe-mois">${evolution.map((e) => `<span>${moisFr(e.mois)}</span>`).join('')}</div>`;
}

/** Répartition présents / absents / excusés, avec légende écrite. */
function repartitionPointages(p) {
  if (!p || !p.total) return '';
  const part = (n) => Math.round((n / p.total) * 100);
  return `
    <div class="repartition" role="img"
         aria-label="${p.presents} présents, ${p.absents} absents, ${p.excuses} excusés">
      ${p.presents ? `<div class="seg-present" style="width:${part(p.presents)}%"></div>` : ''}
      ${p.absents ? `<div class="seg-absent" style="width:${part(p.absents)}%"></div>` : ''}
      ${p.excuses ? `<div class="seg-excuse" style="width:${part(p.excuses)}%"></div>` : ''}
    </div>
    <div class="legende">
      <span><i style="background:var(--vert)"></i> ${nombre(p.presents)} présents</span>
      <span><i style="background:var(--rouge)"></i> ${nombre(p.absents)} absents</span>
      <span><i style="background:var(--ambre-clair)"></i> ${nombre(p.excuses)} excusés</span>
    </div>`;
}

/** Tuile d'indicateur. */
function tuile(valeur, libelle, { ton = '', appoint = '' } = {}) {
  return `<div class="stat ${ton}">
    <div class="valeur">${valeur}</div>
    <div class="libelle">${esc(libelle)}</div>
    ${appoint ? `<div class="appoint">${esc(appoint)}</div>` : ''}
  </div>`;
}

/** Encart des fidèles absents 3 fois de suite. */
function blocAlertes(alertes, contexte = '') {
  if (!alertes || !alertes.length) return '';
  return `<div class="encart-alerte">
    🚨 <strong>Suivi recommandé${contexte ? ' — ' + esc(contexte) : ''} :</strong>
    ${alertes.length} fidèle(s) absent(s) 3 fois de suite —
    ${alertes.map((a) => `${esc(a.prenom)} ${esc(a.nom)}${a.tribu_nom ? ' (' + esc(a.tribu_nom) + ')' : ''}`).join(', ')}.
  </div>`;
}

/* ============ 4. Coquille de l'application ============ */

const appEl = document.getElementById('app');

/** Construit le menu à partir du périmètre réel de l'utilisateur. */
function elementsNav(u) {
  const items = [];
  const p = u.perimetre;

  if (p.tout) {
    items.push(
      ['#/accueil', 'Tableau de bord'],
      ['#/validations', 'Validations'],
      ['#/fideles', 'Fidèles'],
      ['#/tribus', 'Tribus'],
      ['#/departements', 'Départements'],
      ['#/presences', 'Présences'],
      ['#/statistiques', 'Statistiques'],
      ['#/evolution', 'Évolution'],
      ['#/cotisations', 'Cotisations'],
      ['#/demandes', 'Demandes'],
      ['#/annonces', 'Annonces'],
      ['#/qrcode', 'QR Code'],
      ['#/fiches', 'Fiches'],
    );
  } else if (estEncadrant(u)) {
    items.push(['#/accueil', 'Mon tableau de bord']);
    if (p.tribus.length) {
      items.push(['separateur', p.tribus.length > 1 ? 'Mes tribus' : 'Ma tribu']);
      p.tribus.forEach((t) => items.push([`#/tribus/${t.id}`, t.nom]));
    }
    if (p.departements.length) {
      items.push(['separateur', p.departements.length > 1 ? 'Mes départements' : 'Mon département']);
      p.departements.forEach((d) => items.push([`#/departements/${d.id}`, d.nom]));
    }
    items.push(['separateur', 'Suivi']);
    items.push(
      ['#/presences', 'Fiches de présence'],
      ['#/fideles', 'Mes fidèles'],
      ['#/cotisations', 'Cotisations'],
      ['#/demandes', 'Demandes'],
      ['#/annonces', 'Annonces'],
    );
  } else {
    items.push(['#/accueil', 'Accueil'], ['#/mes-presences', 'Mes présences']);
    if (u.tribu_id) items.push([`#/tribus/${u.tribu_id}`, 'Ma tribu']);
    items.push(['#/mes-cotisations', 'Mes cotisations'], ['#/mes-demandes', 'Mes demandes']);
  }

  items.push(['separateur', 'Compte']);
  items.push(['#/profil', 'Mon profil']);
  return items;
}

/** Affiche l'entête + navigation, et retourne le conteneur de la vue. */
function coquille(ancreActive) {
  const u = etat.user;
  const rattachement = [u.tribu_nom, ...(u.departements || []).map((d) => d.nom)]
    .filter(Boolean).join(' · ');

  const logoHtml = etat.logoUrl
    ? `<img src="${etat.logoUrl}" alt="Logo" class="logo-img">`
    : '🌳';

  appEl.innerHTML = `
    <header class="entete">
      <div class="logo">${logoHtml} <span>Arbre de Vie<small>Assemblée — suivi des fidèles</small></span></div>
      <div class="compte">
        <div><strong>${esc(u.prenom)} ${esc(u.nom)}</strong></div>
        <div class="role">${esc(libelleRole(u.role))}${rattachement ? ' · ' + esc(rattachement) : ''}</div>
        <button class="btn-petit btn-secondaire" id="btn-deconnexion">Déconnexion</button>
      </div>
    </header>
    <div class="disposition">
      <nav class="nav">
        ${elementsNav(u).map(([ancre, libelle]) => ancre === 'separateur'
          ? `<span class="separateur-nav">${esc(libelle)}</span>`
          : `<a href="${ancre}" class="${ancre === ancreActive ? 'actif' : ''}">${esc(libelle)}</a>`).join('')}
      </nav>
      <main class="contenu" id="vue"><p class="message-vide">Chargement…</p></main>
    </div>`;

  document.getElementById('btn-deconnexion').onclick = async () => {
    await api.post('/auth/logout');
    etat.user = null;
    location.hash = '';
    afficherAuth();
  };
  return document.getElementById('vue');
}

/* ============ 5. Écran d'authentification ============ */

async function afficherAuth(ongletInitial = 'connexion') {
  appEl.innerHTML = `
    <div class="ecran-auth"><div class="boite-auth">
      <div class="marque">🌳</div>
      <div class="titre-app">Assemblée Arbre de Vie</div>
      <p class="sous-titre">Suivi des fidèles, des tribus et des départements</p>
      <div class="onglets">
        <button id="ong-connexion">Connexion</button>
        <button id="ong-inscription">Inscription</button>
      </div>
      <div id="zone-auth"></div>
    </div></div>`;

  const zone = document.getElementById('zone-auth');
  const boutons = {
    connexion: document.getElementById('ong-connexion'),
    inscription: document.getElementById('ong-inscription'),
  };

  // Les listes de tribus et départements alimentent le formulaire d'inscription.
  let tribus = [];
  let departements = [];
  try {
    [tribus, departements] = await Promise.all([
      api.get('/tribus').then((r) => r.tribus).catch(() => []),
      api.get('/departements').then((r) => r.departements).catch(() => []),
    ]);
  } catch { /* la lecture publique peut échouer : le formulaire reste utilisable */ }

  function afficherOnglet(nom) {
    boutons.connexion.className = nom === 'connexion' ? 'actif' : '';
    boutons.inscription.className = nom === 'inscription' ? 'actif' : '';
    zone.innerHTML = nom === 'connexion'
      ? gabaritConnexion()
      : gabaritInscription(tribus, departements);
    document.getElementById('form-auth').onsubmit = nom === 'connexion'
      ? soumettreConnexion : soumettreInscription;
  }
  boutons.connexion.onclick = () => afficherOnglet('connexion');
  boutons.inscription.onclick = () => afficherOnglet('inscription');
  afficherOnglet(ongletInitial);
}

function gabaritConnexion() {
  return `<form id="form-auth">
    <label>Email ou téléphone</label>
    <input name="identifiant" required autocomplete="username" placeholder="ex. jean@email.com">
    <label>Mot de passe</label>
    <input type="password" name="password" required autocomplete="current-password">
    <button class="btn-bloc" type="submit">Se connecter</button>
  </form>`;
}

function gabaritInscription(tribus, departements) {
  const listeTribus = tribus.map((t) => `<option value="${esc(t.nom)}">`).join('');
  const listeDepts = departements.map((d) => `<option value="${esc(d.nom)}">`).join('');
  return `<form id="form-auth">
    <div class="ligne-champs">
      <div><label>Prénom *</label><input name="prenom" required></div>
      <div><label>Nom *</label><input name="nom" required></div>
    </div>
    <label>Email *</label>
    <input type="email" name="email" required autocomplete="email">
    <div class="ligne-champs">
      <div><label>Téléphone</label><input name="telephone" inputmode="tel" placeholder="+225…"></div>
      <div><label>Numéro WhatsApp</label><input name="whatsapp" inputmode="tel" placeholder="+225…"></div>
    </div>
    <label>Date de naissance</label>
    <input type="date" name="date_naissance">
    <label>Tribu souhaitée</label>
    <input name="tribu_souhaitee" list="liste-tribus" placeholder="ex. SIMGAD">
    <datalist id="liste-tribus">${listeTribus}</datalist>
    <label>Département souhaité</label>
    <input name="departement_souhaite" list="liste-depts" placeholder="ex. GROUPE DE LOUANGE">
    <datalist id="liste-depts">${listeDepts}</datalist>
    <p class="aide">La tribu et le département sont confirmés par le pasteur lors de la validation.</p>
    <label>Mot de passe * (6 caractères minimum)</label>
    <input type="password" name="password" required minlength="6" autocomplete="new-password">
    <button class="btn-bloc" type="submit">Créer mon compte</button>
  </form>`;
}

async function soumettreConnexion(e) {
  e.preventDefault();
  const donnees = Object.fromEntries(new FormData(e.target));
  try {
    await api.post('/auth/login', donnees);
    await rafraichirSession();
    location.hash = '#/accueil';
    await router();
  } catch (err) { toast(err.message, true); }
}

async function soumettreInscription(e) {
  e.preventDefault();
  const donnees = Object.fromEntries(new FormData(e.target));
  try {
    const r = await api.post('/auth/register', donnees);
    if (r.user) {           // premier compte : Pasteur Principal connecté directement
      await rafraichirSession();
      toast(r.message);
      location.hash = '#/accueil';
      await router();
    } else {
      await afficherAuth('connexion');
      toast(r.message);
    }
  } catch (err) { toast(err.message, true); }
}

/** Recharge le profil complet (tribu, départements, périmètre) et le référentiel. */
async function rafraichirSession() {
  const [me] = await Promise.all([api.get('/auth/me'), chargerReferentiel()]);
  etat.user = me.user;
  try {
    const r = await fetch('/api/uploads/logo/current', { credentials: 'same-origin' });
    etat.logoUrl = r.ok ? '/api/uploads/logo/current' : null;
  } catch { etat.logoUrl = null; }
  return etat.user;
}
