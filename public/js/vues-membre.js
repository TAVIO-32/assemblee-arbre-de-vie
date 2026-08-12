/**
 * vues-membre.js — Espace personnel du fidèle et vues transverses.
 *   · Accueil, présences, cotisations et demandes personnelles
 *   · Profil
 *   · Cotisations, demandes et annonces côté responsable
 */

/* ============ Espace du fidèle ============ */

async function vueAccueilFidele(vue) {
  const s = await api.get('/stats/me');
  const u = etat.user;

  vue.innerHTML = `
    <h1>Bienvenue, ${esc(u.prenom)} 👋</h1>
    <p class="sous-titre">
      ${u.tribu_nom ? 'Tribu <strong>' + esc(u.tribu_nom) + '</strong>' : 'Aucune tribu affectée pour le moment.'}
      ${u.departements.length ? ' · ' + u.departements.map((d) => esc(d.nom)).join(', ') : ''}
    </p>

    <div class="grille-stats">
      ${tuile(pourcent(s.presences.taux), 'Mon taux de présence', {
        ton: s.presences.taux !== null && s.presences.taux < 60 ? 'alerte' : 'bien',
      })}
      ${tuile(`${nombre(s.presences.presents)}/${nombre(s.presences.total)}`, 'Présences pointées')}
      ${tuile(nombre(s.cotisations.total_paye || 0), 'Cotisations payées')}
      ${tuile(nombre(s.cotisations.total_du || 0), 'Reste à payer', { ton: s.cotisations.total_du ? 'alerte' : '' })}
    </div>

    ${s.tribu && s.tribu.taux_presence !== null ? `<div class="carte">
      <h3>Ma tribu</h3>
      <p class="detail">Taux de présence de la tribu ${esc(s.tribu.nom)} :</p>
      ${jauge(s.tribu.taux_presence)}
    </div>` : ''}

    ${s.evolution && s.evolution.length ? `<h2>Mon assiduité mois par mois</h2>
      <div class="carte">${colonnesEvolution(s.evolution)}</div>` : ''}

    <div class="carte">
      <h3>Actions rapides</h3>
      <div class="barre-actions">
        <a class="btn btn-petit" href="#/mes-demandes">🙏 Soumettre un sujet de prière</a>
        <a class="btn btn-petit btn-secondaire" href="#/mes-presences">Mes présences</a>
        <a class="btn btn-petit btn-secondaire" href="#/profil">Mettre à jour mon profil</a>
      </div>
    </div>`;
}

async function vueMesPresences(vue) {
  const [r, s] = await Promise.all([api.get('/evenements/presences/me'), api.get('/stats/me')]);
  vue.innerHTML = `
    <h1>Mes présences</h1>
    <p class="sous-titre">Votre historique de participation.</p>
    <div class="grille-stats">
      ${tuile(pourcent(s.presences.taux), 'Taux de présence', { ton: 'accent' })}
      ${tuile(nombre(s.presences.presents), 'Présent', { ton: 'bien' })}
      ${tuile(nombre(s.presences.absents), 'Absent', { ton: s.presences.absents ? 'alerte' : '' })}
      ${tuile(nombre(s.presences.excuses), 'Excusé')}
    </div>
    <div class="liste">
      ${r.historique.map((p) => `<div class="element">
        <div class="infos">
          <div class="nom">${esc(p.titre)}</div>
          <div class="detail">${esc(etat.ref.types_evenement[p.type] || p.type)} · ${dateFr(p.date)}
            ${p.tribu_nom ? ' · Tribu ' + esc(p.tribu_nom) : ''}${p.departement_nom ? ' · ' + esc(p.departement_nom) : ''}</div>
        </div>
        ${badgePresence(p.statut)}
      </div>`).join('') || '<p class="message-vide">Aucune présence pointée pour le moment.</p>'}
    </div>`;
}

async function vueMesCotisations(vue) {
  const r = await api.get('/cotisations/me');
  vue.innerHTML = `
    <h1>Mes cotisations</h1>
    <div class="liste">
      ${r.cotisations.map((c) => `<div class="element">
        <div class="infos">
          <div class="nom">${nombre(c.montant)}${c.libelle ? ' — ' + esc(c.libelle) : ''}</div>
          <div class="detail">${dateFr(c.date)}</div>
        </div>
        <span class="badge ${c.statut === 'paye' ? 'badge-vert' : 'badge-rouge'}">${c.statut === 'paye' ? '✓ Payé' : '✕ Non payé'}</span>
      </div>`).join('') || '<p class="message-vide">Aucune cotisation enregistrée.</p>'}
    </div>`;
}

async function vueMesDemandes(vue) {
  const r = await api.get('/demandes/me');
  vue.innerHTML = `
    <h1>Mes demandes</h1>
    <p class="sous-titre">Vos sujets de prière, préoccupations et besoins.
      <strong>Confidentiel :</strong> seuls les pasteurs, votre patriarche et vos responsables peuvent les lire.</p>
    <div class="carte">
      <form id="form-demande">
        <label>Type de demande</label>
        <select name="type">${Object.entries(etat.ref.types_demande).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
        <label>Votre message *</label>
        <textarea name="contenu" required placeholder="Partagez votre sujet de prière, préoccupation ou besoin…"></textarea>
        <button class="btn-bloc" type="submit">Envoyer ma demande</button>
      </form>
    </div>
    <div class="liste">
      ${r.demandes.map((d) => `<div class="element" data-id="${d.id}">
        <div class="infos">
          <div class="nom"><span class="badge badge-teal">${esc(etat.ref.types_demande[d.type])}</span>
            <span class="badge ${d.statut === 'traite' ? 'badge-vert' : d.statut === 'en_cours' ? 'badge-ambre' : 'badge-gris'}">${esc(etat.ref.statuts_demande[d.statut])}</span></div>
          <div class="detail">${esc(d.contenu)}</div>
          <div class="detail">${dateFr(d.created_at)}</div>
        </div>
        <button class="btn-petit btn-danger btn-suppr">Retirer</button>
      </div>`).join('') || '<p class="message-vide">Aucune demande soumise.</p>'}
    </div>`;

  document.getElementById('form-demande').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/demandes', Object.fromEntries(new FormData(e.target)));
      toast('Demande transmise aux responsables. 🙏');
      vueMesDemandes(vue);
    } catch (err) { toast(err.message, true); }
  };
  vue.querySelectorAll('.btn-suppr').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Retirer cette demande ?')) return;
      try { await api.del('/demandes/' + b.closest('.element').dataset.id); vueMesDemandes(vue); }
      catch (err) { toast(err.message, true); }
    };
  });
}

/* ============ Profil ============ */

async function vueProfil(vue) {
  const u = etat.user;
  vue.innerHTML = `
    <h1>Mon profil</h1>
    <p class="sous-titre">${esc(libelleRole(u.role))}${u.tribu_nom ? ' · Tribu ' + esc(u.tribu_nom) : ''}
      ${u.departements.length ? ' · ' + u.departements.map((d) => esc(d.nom)).join(', ') : ''}</p>

    <div class="carte zone-photo-profil">
      <h3>Ma photo</h3>
      <div class="photo-profil-conteneur">
        <div id="apercu-photo">${u.photo
          ? `<img src="${urlPhoto(u.photo)}" alt="Photo" class="photo-profil">`
          : avatarHtml(null, u.prenom, u.nom, 80)}</div>
        <div class="photo-actions">
          <label class="btn btn-petit btn-secondaire">
            Choisir une photo
            <input type="file" id="input-photo" accept="image/*" hidden>
          </label>
          ${u.photo ? '<button class="btn-petit btn-danger" id="btn-suppr-photo">Supprimer</button>' : ''}
        </div>
      </div>
    </div>

    <div class="carte">
      <form id="form-profil">
        <div class="ligne-champs">
          <div><label>Prénom *</label><input name="prenom" required value="${esc(u.prenom)}"></div>
          <div><label>Nom *</label><input name="nom" required value="${esc(u.nom)}"></div>
        </div>
        <label>Email (identifiant, non modifiable)</label>
        <input value="${esc(u.email)}" disabled>
        <div class="ligne-champs">
          <div><label>Téléphone</label><input name="telephone" inputmode="tel" value="${esc(u.telephone)}"></div>
          <div><label>Numéro WhatsApp</label><input name="whatsapp" inputmode="tel" value="${esc(u.whatsapp)}"></div>
        </div>
        <label>Date de naissance</label>
        <input type="date" name="date_naissance" value="${esc(u.date_naissance)}">
        <label>Nouveau mot de passe (laisser vide pour conserver l'actuel)</label>
        <input type="password" name="password" minlength="6" autocomplete="new-password">
        <button class="btn-bloc" type="submit">Enregistrer mon profil</button>
      </form>
    </div>

    ${estDirection() ? `<div class="carte">
      <h3>Logo de l'assemblée</h3>
      <p class="aide" style="margin:0 0 10px">Le logo apparaît dans l'entête de l'application. JPG, PNG ou WebP, 2 Mo max.</p>
      <div class="photo-profil-conteneur">
        <div id="apercu-logo">${etat.logoUrl
          ? `<img src="${etat.logoUrl}" alt="Logo" class="photo-profil" style="border-radius:8px">`
          : '<span class="avatar avatar-initiales" style="width:80px;height:80px;font-size:32px;border-radius:8px">🌳</span>'}</div>
        <div class="photo-actions">
          <label class="btn btn-petit btn-secondaire">
            Choisir un logo
            <input type="file" id="input-logo" accept="image/*" hidden>
          </label>
          ${etat.logoUrl ? '<button class="btn-petit btn-danger" id="btn-suppr-logo">Supprimer le logo</button>' : ''}
        </div>
      </div>
    </div>` : ''}`;

  document.getElementById('form-profil').onsubmit = async (e) => {
    e.preventDefault();
    const donnees = Object.fromEntries(new FormData(e.target));
    if (!donnees.password) delete donnees.password;
    try {
      await api.put('/users/me', donnees);
      await rafraichirSession();
      toast('Profil mis à jour.');
      router();
    } catch (err) { toast(err.message, true); }
  };

  document.getElementById('input-photo').onchange = async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    const fd = new FormData();
    fd.append('photo', fichier);
    try {
      await api.upload('/uploads/photo', fd);
      await rafraichirSession();
      toast('Photo mise à jour.');
      vueProfil(vue);
    } catch (err) { toast(err.message, true); }
  };

  const btnSupprPhoto = document.getElementById('btn-suppr-photo');
  if (btnSupprPhoto) btnSupprPhoto.onclick = async () => {
    try {
      await api.del('/uploads/photo');
      await rafraichirSession();
      toast('Photo supprimée.');
      vueProfil(vue);
    } catch (err) { toast(err.message, true); }
  };

  const inputLogo = document.getElementById('input-logo');
  if (inputLogo) inputLogo.onchange = async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    const fd = new FormData();
    fd.append('logo', fichier);
    try {
      await api.upload('/uploads/logo', fd);
      await rafraichirSession();
      toast('Logo mis à jour.');
      vueProfil(vue);
    } catch (err) { toast(err.message, true); }
  };

  const btnSupprLogo = document.getElementById('btn-suppr-logo');
  if (btnSupprLogo) btnSupprLogo.onclick = async () => {
    try {
      await api.del('/uploads/logo');
      await rafraichirSession();
      toast('Logo supprimé.');
      vueProfil(vue);
    } catch (err) { toast(err.message, true); }
  };
}

/* ============ Cotisations (responsables) ============ */

async function vueCotisations(vue) {
  const [r, membres] = await Promise.all([
    api.get('/cotisations'), api.get('/users?statut=actif').then((m) => m.users),
  ]);

  vue.innerHTML = `
    <h1>Cotisations</h1>
    <p class="sous-titre">Enregistrez et suivez les cotisations des fidèles de votre périmètre.</p>
    <div class="carte">
      <form id="form-cot">
        <label>Fidèle *</label>
        <select name="membre_id" required>
          <option value="">— Choisir un fidèle —</option>
          ${membres.map((u) => `<option value="${u.id}">${esc(u.prenom)} ${esc(u.nom)}${u.tribu_nom ? ' (' + esc(u.tribu_nom) + ')' : ''}</option>`).join('')}
        </select>
        <div class="ligne-champs">
          <div><label>Montant *</label><input type="number" name="montant" min="1" step="any" required inputmode="decimal"></div>
          <div><label>Date *</label><input type="date" name="date" required value="${aujourdhui()}"></div>
        </div>
        <div class="ligne-champs">
          <div><label>Libellé</label><input name="libelle" placeholder="ex. Cotisation mensuelle"></div>
          <div><label>Statut</label><select name="statut"><option value="paye">Payé</option><option value="non_paye">Non payé</option></select></div>
        </div>
        <button class="btn-bloc" type="submit">Enregistrer la cotisation</button>
      </form>
    </div>
    <div class="liste">
      ${r.cotisations.map((c) => `<div class="element" data-id="${c.id}">
        <div class="infos">
          <div class="nom">${esc(c.prenom)} ${esc(c.nom)}
            <span class="badge ${c.statut === 'paye' ? 'badge-vert' : 'badge-rouge'}">${c.statut === 'paye' ? '✓ Payé' : '✕ Non payé'}</span></div>
          <div class="detail"><strong>${nombre(c.montant)}</strong>${c.libelle ? ' · ' + esc(c.libelle) : ''} · ${dateFr(c.date)}${c.tribu_nom ? ' · Tribu ' + esc(c.tribu_nom) : ''}</div>
        </div>
        <div class="actions">
          <button class="btn-petit btn-secondaire btn-basculer">${c.statut === 'paye' ? 'Marquer non payé' : 'Marquer payé'}</button>
          <button class="btn-petit btn-danger btn-suppr">✕</button>
        </div>
      </div>`).join('') || '<p class="message-vide">Aucune cotisation enregistrée.</p>'}
    </div>`;

  document.getElementById('form-cot').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/cotisations', Object.fromEntries(new FormData(e.target)));
      toast('Cotisation enregistrée.');
      vueCotisations(vue);
    } catch (err) { toast(err.message, true); }
  };
  vue.querySelectorAll('.element').forEach((el) => {
    const id = el.dataset.id;
    const c = r.cotisations.find((x) => x.id === Number(id));
    el.querySelector('.btn-basculer').onclick = async () => {
      try {
        await api.put('/cotisations/' + id, { statut: c.statut === 'paye' ? 'non_paye' : 'paye' });
        vueCotisations(vue);
      } catch (err) { toast(err.message, true); }
    };
    el.querySelector('.btn-suppr').onclick = async () => {
      if (!confirm('Supprimer cette cotisation ?')) return;
      try { await api.del('/cotisations/' + id); vueCotisations(vue); }
      catch (err) { toast(err.message, true); }
    };
  });
}

/* ============ Demandes (responsables) ============ */

async function vueDemandesResponsable(vue) {
  const r = await api.get('/demandes');
  vue.innerHTML = `
    <h1>Demandes des fidèles</h1>
    <p class="sous-titre">Sujets de prière, préoccupations et besoins — confidentiels, limités à votre périmètre.</p>
    <div class="liste">
      ${r.demandes.map((d) => `<div class="element" data-id="${d.id}">
        <div class="infos">
          <div class="nom">${esc(d.prenom)} ${esc(d.nom)}
            <span class="badge badge-teal">${esc(etat.ref.types_demande[d.type])}</span>
            <span class="badge ${d.statut === 'traite' ? 'badge-vert' : d.statut === 'en_cours' ? 'badge-ambre' : 'badge-rouge'}">${esc(etat.ref.statuts_demande[d.statut])}</span>
          </div>
          <div class="detail">${esc(d.contenu)}</div>
          <div class="detail">${d.tribu_nom ? 'Tribu ' + esc(d.tribu_nom) + ' · ' : ''}${dateFr(d.created_at)}</div>
        </div>
        <div class="actions">
          <select class="sel-statut">
            ${Object.entries(etat.ref.statuts_demande).map(([v, l]) => `<option value="${v}" ${d.statut === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>
      </div>`).join('') || '<p class="message-vide">Aucune demande pour le moment.</p>'}
    </div>`;

  vue.querySelectorAll('.sel-statut').forEach((sel) => {
    sel.onchange = async () => {
      try {
        await api.put(`/demandes/${sel.closest('.element').dataset.id}/statut`, { statut: sel.value });
        toast('Statut mis à jour.');
        vueDemandesResponsable(vue);
      } catch (err) { toast(err.message, true); }
    };
  });
}

/* ============ Annonces WhatsApp ============ */

async function vueAnnonces(vue) {
  const [r, tribus, departements] = await Promise.all([
    api.get('/annonces'), chargerTribus(), chargerDepartements(),
  ]);
  const direction = estDirection();
  const p = etat.user.perimetre;
  const mesTribus = direction ? tribus : tribus.filter((t) => p.tribus.some((x) => x.id === t.id));
  const mesDepts = direction ? departements : departements.filter((d) => p.departements.some((x) => x.id === d.id));

  const cibles = [];
  if (direction) cibles.push(['assemblee', "Toute l'assemblée"]);
  else cibles.push(['assemblee', 'Tous mes fidèles']);
  if (mesTribus.length) cibles.push(['tribu', 'Une tribu']);
  if (mesDepts.length) cibles.push(['departement', 'Un département']);

  vue.innerHTML = `
    <h1>Annonces WhatsApp</h1>
    <p class="sous-titre">L'application génère un lien WhatsApp pré-rempli par destinataire.</p>
    <div class="carte">
      <form id="form-annonce">
        <label>Titre *</label>
        <input name="titre" required placeholder="ex. Réunion de tribu samedi">
        <label>Message *</label>
        <textarea name="contenu" required placeholder="Contenu de l'annonce…"></textarea>
        <label>Destinataires</label>
        <select name="cible" id="sel-cible">
          ${cibles.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
        </select>
        <div id="zone-cible-annonce"></div>
        <button class="btn-bloc" type="submit">Préparer l'envoi WhatsApp</button>
      </form>
      <div id="resultat-envoi"></div>
    </div>

    <h2>Historique</h2>
    <div class="liste">
      ${r.annonces.map((a) => `<div class="element">
        <div class="infos">
          <div class="nom">${esc(a.titre)}</div>
          <div class="detail">${esc(a.contenu)}</div>
          <div class="detail">Par ${esc(a.auteur || '—')} ·
            ${a.tribu_nom ? 'Tribu ' + esc(a.tribu_nom) : a.departement_nom ? esc(a.departement_nom) : "Toute l'assemblée"}
            · ${nombre(a.nb_destinataires)} destinataire(s) · ${dateFr(a.created_at)}</div>
        </div>
      </div>`).join('') || '<p class="message-vide">Aucune annonce envoyée pour le moment.</p>'}
    </div>`;

  const zone = document.getElementById('zone-cible-annonce');
  const selCible = document.getElementById('sel-cible');
  function majCible() {
    if (selCible.value === 'tribu') {
      zone.innerHTML = `<label>Tribu</label><select name="cible_id">${options(mesTribus, null, '— Choisir —')}</select>`;
    } else if (selCible.value === 'departement') {
      zone.innerHTML = `<label>Département</label><select name="cible_id">${options(mesDepts, null, '— Choisir —')}</select>`;
    } else {
      zone.innerHTML = '';
    }
  }
  selCible.onchange = majCible;
  majCible();

  document.getElementById('form-annonce').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/annonces', Object.fromEntries(new FormData(e.target)));
      const sortie = document.getElementById('resultat-envoi');
      sortie.innerHTML = `
        <h3 style="margin-top:18px">Liens d'envoi (${res.liens.length})</h3>
        <button class="btn-petit btn-secondaire" id="btn-copier">📋 Copier le message groupé</button>
        <div style="margin-top:10px">
          ${res.liens.map((l) => `<div class="lien-wa"><span>${esc(l.nom)}</span>
            <a href="${esc(l.lien)}" target="_blank" rel="noopener">Envoyer sur WhatsApp →</a></div>`).join('')}
        </div>
        ${res.sansNumero.length ? `<p class="aide" style="color:var(--rouge)">Sans numéro WhatsApp :
          ${res.sansNumero.map((s) => esc(s.nom)).join(', ')}</p>` : ''}`;
      document.getElementById('btn-copier').onclick = async () => {
        await navigator.clipboard.writeText(res.message);
        toast('Message copié — collez-le dans un groupe WhatsApp.');
      };
      toast('Annonce enregistrée.');
    } catch (err) { toast(err.message, true); }
  };
}
