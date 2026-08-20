/**
 * core.js — Socle de l'application ZAURA.
 */

/* ============ 1. Etat global et utilitaires ============ */

const etat = {
  user: null,
  org: null,
  ref: null,
  tribus: [],
  departements: [],
  logoUrl: null,
};

function esc(valeur) {
  return String(valeur ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function toast(message, estErreur = false) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className = 'visible' + (estErreur ? ' erreur' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3500);
}

function dateFr(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return j && m && a ? `${j}/${m}/${a}` : iso;
}

const MOIS_COURTS = ['janv.', 'fevr.', 'mars', 'avr.', 'mai', 'juin',
                     'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];

function moisFr(aaaaMm) {
  const [a, m] = String(aaaaMm || '').split('-');
  const i = Number(m) - 1;
  return MOIS_COURTS[i] ? `${MOIS_COURTS[i]} ${String(a).slice(2)}` : aaaaMm;
}

function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nombre(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

function pourcent(taux) {
  return taux === null || taux === undefined ? '—' : taux + '%';
}

/* ============ 2. Referentiel et caches ============ */

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
function estEncadrant(user = etat.user) {
  if (!user || !user.perimetre) return false;
  return user.perimetre.tout
    || user.perimetre.tribus.length > 0
    || user.perimetre.departements.length > 0;
}

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

function optionsRoles(selectionne) {
  const monNiveau = niveauRole(etat.user.role);
  const principal = etat.user.role === 'pasteur_principal';
  return etat.ref.ordre_roles
    .filter((code) => principal || niveauRole(code) < monNiveau)
    .map((code) => `<option value="${code}" ${selectionne === code ? 'selected' : ''}>${esc(libelleRole(code))}</option>`)
    .join('');
}

/* ============ 3. Composants d'affichage ============ */

function badgeRole(code) {
  const n = niveauRole(code);
  const classe = n >= 60 ? 'badge-teal' : n >= 30 ? 'badge-or' : 'badge-gris';
  return `<span class="badge ${classe}">${esc(libelleRole(code))}</span>`;
}

const ICONES_PRESENCE = { present: '✓', absent: '✕', excuse: '~' };
function badgePresence(statut) {
  if (!statut) return '<span class="badge badge-gris">Non pointe</span>';
  const classe = statut === 'present' ? 'badge-vert' : statut === 'absent' ? 'badge-rouge' : 'badge-ambre';
  const libelle = etat.ref ? etat.ref.statuts_presence[statut] : statut;
  return `<span class="badge ${classe}">${ICONES_PRESENCE[statut] || ''} ${esc(libelle)}</span>`;
}

function jauge(taux) {
  if (taux === null || taux === undefined) {
    return '<span class="badge badge-gris">Aucun pointage</span>';
  }
  const classe = taux < 50 ? 'basse' : taux < 75 ? 'moyenne' : 'haute';
  return `<div class="jauge-ligne">
    <div class="jauge ${classe}" title="${taux}% de presence"><div style="width:${taux}%"></div></div>
    <span class="jauge-valeur">${taux}%</span>
  </div>`;
}

function barres(lignes) {
  if (!lignes.length) return '<p class="message-vide">Aucune donnee.</p>';
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

function colonnesEvolution(evolution) {
  if (!evolution || !evolution.length) {
    return '<p class="message-vide">Pas encore assez de pointages pour tracer une evolution.</p>';
  }
  return `
    <div class="colonnes">
      ${evolution.map((e) => `
        <div class="colonne" title="${moisFr(e.mois)} : ${e.taux}% de presence sur ${e.total} pointage(s)">
          <span class="val">${e.taux}%</span>
          <div class="tige ${e.total ? '' : 'vide'}" style="height:${Math.max(e.taux, 1)}%"></div>
        </div>`).join('')}
    </div>
    <div class="axe-mois">${evolution.map((e) => `<span>${moisFr(e.mois)}</span>`).join('')}</div>`;
}

function repartitionPointages(p) {
  if (!p || !p.total) return '';
  const part = (n) => Math.round((n / p.total) * 100);
  return `
    <div class="repartition" role="img"
         aria-label="${p.presents} presents, ${p.absents} absents, ${p.excuses} excuses">
      ${p.presents ? `<div class="seg-present" style="width:${part(p.presents)}%"></div>` : ''}
      ${p.absents ? `<div class="seg-absent" style="width:${part(p.absents)}%"></div>` : ''}
      ${p.excuses ? `<div class="seg-excuse" style="width:${part(p.excuses)}%"></div>` : ''}
    </div>
    <div class="legende">
      <span><i style="background:var(--vert)"></i> ${nombre(p.presents)} presents</span>
      <span><i style="background:var(--rouge)"></i> ${nombre(p.absents)} absents</span>
      <span><i style="background:var(--ambre-clair)"></i> ${nombre(p.excuses)} excuses</span>
    </div>`;
}

function tuile(valeur, libelle, { ton = '', appoint = '' } = {}) {
  return `<div class="stat ${ton}">
    <div class="valeur">${valeur}</div>
    <div class="libelle">${esc(libelle)}</div>
    ${appoint ? `<div class="appoint">${esc(appoint)}</div>` : ''}
  </div>`;
}

function blocAlertes(alertes, contexte = '') {
  if (!alertes || !alertes.length) return '';
  return `<div class="encart-alerte">
    <strong>Suivi recommande${contexte ? ' — ' + esc(contexte) : ''} :</strong>
    ${alertes.length} fidele(s) absent(s) 3 fois de suite —
    ${alertes.map((a) => `${esc(a.prenom)} ${esc(a.nom)}${a.tribu_nom ? ' (' + esc(a.tribu_nom) + ')' : ''}`).join(', ')}.
  </div>`;
}

/* ============ 4. Coquille de l'application ============ */

const appEl = document.getElementById('app');

function elementsNav(u) {
  const items = [];
  const p = u.perimetre;

  const lbl1 = etat.org ? etat.org.label_section1 || 'Tribus' : 'Tribus';
  const lbl2 = etat.org ? etat.org.label_section2 || 'Departements' : 'Departements';

  if (p.tout) {
    items.push(
      ['#/accueil', 'Tableau de bord'],
      ['#/validations', 'Validations'],
      ['#/fideles', 'Fideles'],
      ['#/tribus', lbl1],
      ['#/departements', lbl2],
      ['#/presences', 'Presences'],
      ['#/statistiques', 'Statistiques'],
      ['#/evolution', 'Evolution'],
      ['#/cotisations', 'Cotisations'],
      ['#/demandes', 'Demandes'],
      ['#/annonces', 'Annonces'],
      ['#/qrcode', 'QR Code'],
      ['#/fiches', 'Fiches'],
      ['#/versets', 'Versets en direct'],
      ['#/parametres', 'Parametres'],
    );
  } else if (estEncadrant(u)) {
    items.push(['#/accueil', 'Mon tableau de bord']);
    if (p.tribus.length) {
      items.push(['separateur', p.tribus.length > 1 ? 'Mes ' + lbl1.toLowerCase() : 'Mon ' + lbl1.toLowerCase().replace(/s$/, '')]);
      p.tribus.forEach((t) => items.push([`#/tribus/${t.id}`, t.nom]));
    }
    if (p.departements.length) {
      items.push(['separateur', p.departements.length > 1 ? 'Mes ' + lbl2.toLowerCase() : 'Mon ' + lbl2.toLowerCase().replace(/s$/, '')]);
      p.departements.forEach((d) => items.push([`#/departements/${d.id}`, d.nom]));
    }
    items.push(['separateur', 'Suivi']);
    items.push(
      ['#/presences', 'Fiches de presence'],
      ['#/fideles', 'Mes fideles'],
      ['#/cotisations', 'Cotisations'],
      ['#/demandes', 'Demandes'],
      ['#/annonces', 'Annonces'],
    );
  } else {
    items.push(['#/accueil', 'Accueil'], ['#/mes-presences', 'Mes presences']);
    if (u.tribu_id) items.push([`#/tribus/${u.tribu_id}`, 'Mon ' + lbl1.toLowerCase().replace(/s$/, '')]);
    items.push(['#/mes-cotisations', 'Mes cotisations'], ['#/mes-demandes', 'Mes demandes']);
  }

  items.push(['separateur', 'Compte']);
  items.push(['#/profil', 'Mon profil']);
  return items;
}

function coquille(ancreActive) {
  const u = etat.user;
  const o = etat.org;
  const rattachement = [u.tribu_nom, ...(u.departements || []).map((d) => d.nom)]
    .filter(Boolean).join(' · ');

  const nomEglise = o ? o.nom : 'ZAURA';

  appEl.innerHTML = `
    <header class="entete">
      <div class="logo"><span class="logo-zaura">Z</span> <span>${esc(nomEglise)}<small>ZAURA</small></span></div>
      <div class="compte">
        <div><strong>${esc(u.prenom)} ${esc(u.nom)}</strong></div>
        <div class="role">${esc(libelleRole(u.role))}${rattachement ? ' · ' + esc(rattachement) : ''}</div>
        <button class="btn-petit btn-secondaire" id="btn-deconnexion">Deconnexion</button>
      </div>
    </header>
    <div class="disposition">
      <nav class="nav">
        ${elementsNav(u).map(([ancre, libelle]) => ancre === 'separateur'
          ? `<span class="separateur-nav">${esc(libelle)}</span>`
          : `<a href="${ancre}" class="${ancre === ancreActive ? 'actif' : ''}">${esc(libelle)}</a>`).join('')}
      </nav>
      <main class="contenu" id="vue"><p class="message-vide">Chargement...</p></main>
    </div>`;

  document.getElementById('btn-deconnexion').onclick = async () => {
    await api.post('/auth/logout');
    etat.user = null;
    etat.org = null;
    location.hash = '';
    afficherAuth();
  };
  return document.getElementById('vue');
}

/* ============ 5. Ecran d'authentification multi-tenant ============ */

async function afficherAuth(ongletInitial = 'connexion') {
  appEl.innerHTML = `
    <div class="ecran-auth"><div class="boite-auth">
      <div class="marque"><span class="logo-zaura logo-zaura-grand">Z</span></div>
      <div class="titre-app">ZAURA</div>
      <p class="sous-titre">Plateforme de gestion pour eglises</p>
      <div class="onglets onglets-3">
        <button id="ong-connexion">Connexion</button>
        <button id="ong-inscription">Inscription</button>
        <button id="ong-creation">Creer une eglise</button>
      </div>
      <div id="zone-auth"></div>
    </div></div>`;

  const zone = document.getElementById('zone-auth');
  const boutons = {
    connexion: document.getElementById('ong-connexion'),
    inscription: document.getElementById('ong-inscription'),
    creation: document.getElementById('ong-creation'),
  };

  function afficherOnglet(nom) {
    Object.entries(boutons).forEach(([k, b]) => { b.className = k === nom ? 'actif' : ''; });
    if (nom === 'connexion') {
      zone.innerHTML = gabaritConnexion();
      document.getElementById('form-auth').onsubmit = soumettreConnexion;
    } else if (nom === 'inscription') {
      zone.innerHTML = gabaritInscription();
      document.getElementById('form-auth').onsubmit = soumettreInscription;
    } else {
      zone.innerHTML = gabaritCreation();
      document.getElementById('form-auth').onsubmit = soumettreCreation;
    }
  }
  boutons.connexion.onclick = () => afficherOnglet('connexion');
  boutons.inscription.onclick = () => afficherOnglet('inscription');
  boutons.creation.onclick = () => afficherOnglet('creation');
  afficherOnglet(ongletInitial);
}

function gabaritConnexion() {
  return `<form id="form-auth">
    <label>Identifiant de votre eglise (slug)</label>
    <input name="slug" required placeholder="ex. assemblee-arbre-de-vie" autocomplete="organization">
    <p class="aide">Demandez-le a votre pasteur si vous ne le connaissez pas.</p>
    <label>Email ou telephone</label>
    <input name="identifiant" required autocomplete="username" placeholder="ex. jean@email.com">
    <label>Mot de passe</label>
    <input type="password" name="password" required autocomplete="current-password">
    <button class="btn-bloc" type="submit">Se connecter</button>
  </form>`;
}

function gabaritInscription() {
  return `<form id="form-auth">
    <label>Identifiant de votre eglise (slug) *</label>
    <input name="slug" required placeholder="ex. assemblee-arbre-de-vie" autocomplete="organization">
    <p class="aide">Le slug identifie votre eglise sur ZAURA. Demandez-le a votre pasteur.</p>
    <div class="ligne-champs">
      <div><label>Prenom *</label><input name="prenom" required></div>
      <div><label>Nom *</label><input name="nom" required></div>
    </div>
    <label>Email *</label>
    <input type="email" name="email" required autocomplete="email">
    <div class="ligne-champs">
      <div><label>Telephone</label><input name="telephone" inputmode="tel" placeholder="+225..."></div>
      <div><label>Numero WhatsApp</label><input name="whatsapp" inputmode="tel" placeholder="+225..."></div>
    </div>
    <label>Date de naissance</label>
    <input type="date" name="date_naissance">
    <label>Tribu souhaitee</label>
    <input name="tribu_souhaitee" placeholder="ex. SIMGAD">
    <label>Departement souhaite</label>
    <input name="departement_souhaite" placeholder="ex. GROUPE DE LOUANGE">
    <p class="aide">La tribu et le departement sont confirmes par le pasteur lors de la validation.</p>
    <label>Mot de passe * (6 caracteres minimum)</label>
    <input type="password" name="password" required minlength="6" autocomplete="new-password">
    <button class="btn-bloc" type="submit">Creer mon compte</button>
  </form>`;
}

function gabaritCreation() {
  return `<form id="form-auth">
    <div class="encart-info" style="margin-bottom:16px">
      Creez votre espace eglise sur ZAURA. Vous beneficiez de <strong>14 jours d'essai gratuit</strong>.
    </div>
    <label>Nom de votre eglise *</label>
    <input name="nom_eglise" required placeholder="ex. Assemblee Arbre de Vie">
    <label>Email de l'eglise *</label>
    <input type="email" name="email" required placeholder="contact@eglise.com" autocomplete="email">
    <div class="ligne-champs">
      <div><label>Telephone</label><input name="telephone" inputmode="tel" placeholder="+225..."></div>
      <div><label>Adresse</label><input name="adresse" placeholder="Ville, quartier"></div>
    </div>
    <hr style="border:none;border-top:1px solid var(--bordure);margin:18px 0">
    <p style="font-weight:700;font-size:.9rem;color:var(--texte-doux)">Votre compte Pasteur Principal</p>
    <div class="ligne-champs">
      <div><label>Prenom *</label><input name="prenom" required></div>
      <div><label>Nom *</label><input name="nom" required></div>
    </div>
    <label>Mot de passe * (6 caracteres minimum)</label>
    <input type="password" name="password" required minlength="6" autocomplete="new-password">
    <button class="btn-bloc" type="submit">Creer mon eglise</button>
    <p class="aide" style="text-align:center;margin-top:12px">
      Mensuel : 5 000 FCFA/mois &middot; Annuel : 50 000 FCFA/an (2 mois offerts)<br>
      Paiement Wave ou Orange Money
    </p>
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
    if (r.user) {
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

async function soumettreCreation(e) {
  e.preventDefault();
  const donnees = Object.fromEntries(new FormData(e.target));
  try {
    const r = await api.post('/organisations/register', donnees);
    if (r.user) {
      await rafraichirSession();
      toast(r.message || 'Eglise creee avec succes !');
      location.hash = '#/accueil';
      await router();
    }
  } catch (err) { toast(err.message, true); }
}

async function rafraichirSession() {
  const [me] = await Promise.all([api.get('/auth/me'), chargerReferentiel()]);
  etat.user = me.user;
  etat.org = me.organisation || null;
  try {
    const r = await fetch('/api/uploads/logo/current', { credentials: 'same-origin' });
    etat.logoUrl = r.ok ? '/api/uploads/logo/current' : null;
  } catch { etat.logoUrl = null; }
  return etat.user;
}
