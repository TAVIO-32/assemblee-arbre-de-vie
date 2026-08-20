/**
 * vues-direction.js — Vues du corps pastoral.
 *   · Tableau de bord de l'assemblée
 *   · Statistiques détaillées
 *   · Validation des comptes
 *   · Annuaire des fidèles et fiche individuelle
 *   · Administration des tribus et des départements
 */

/* ============ Tableau de bord de l'assemblée ============ */

async function vueAccueilDirection(vue) {
  const s = await api.get('/stats/global');
  const e = s.effectifs;
  const lbl1 = etat.org ? etat.org.label_section1 || 'Tribus' : 'Tribus';
  const lbl2 = etat.org ? etat.org.label_section2 || 'Departements' : 'Departements';

  vue.innerHTML = `
    <h1>Tableau de bord de l'assemblée</h1>
    <p class="sous-titre">Vue d'ensemble : ${nombre(e.fideles_actifs)} membre(s),
      ${nombre(e.tribus)} ${lbl1.toLowerCase()}, ${nombre(e.departements)} ${lbl2.toLowerCase()}.</p>

    ${banniereAbonnement()}

    ${e.comptes_en_attente ? `<div class="encart-attention">⏳ <strong>${e.comptes_en_attente}</strong>
      compte(s) en attente de validation — <a href="#/validations">valider maintenant</a></div>` : ''}
    ${e.sans_tribu ? `<div class="encart-info">👥 <strong>${e.sans_tribu}</strong> membre(s) actif(s)
      ne sont rattachés à aucune tribu — <a href="#/fideles">les rattacher</a></div>` : ''}
    ${blocAlertes(s.alertes_absences)}

    <div class="grille-stats">
      ${tuile(nombre(e.fideles_actifs), 'Total membres', { ton: 'accent' })}
      ${tuile(nombre(e.serviteurs || 0), 'Serviteurs', { ton: 'bien', appoint: 'avec département' })}
      ${tuile(nombre(e.fideles_simples || 0), 'Fidèles', { appoint: 'sans département' })}
      ${tuile(pourcent(s.taux_presence_global), 'Taux de présence', {
        ton: s.taux_presence_global !== null && s.taux_presence_global < 60 ? 'alerte' : 'bien',
        appoint: `${nombre(s.presence.total)} pointage(s)`,
      })}
      ${tuile(nombre(e.evenements), 'Événements enregistrés')}
      ${tuile(nombre(e.demandes_nouvelles), 'Nouvelles demandes', { ton: e.demandes_nouvelles ? 'alerte' : '' })}
    </div>

    <div class="carte">
      <h3>Répartition des pointages</h3>
      ${s.presence.total ? repartitionPointages(s.presence)
        : '<p class="message-vide">Aucun pointage enregistré pour le moment.</p>'}
    </div>

    <h2>Évolution du taux de présence</h2>
    <div class="carte">${colonnesEvolution(s.evolution)}</div>

    ${s.comptages && s.comptages.nb_comptages ? `<div class="carte">
      <h3>Comptage des cultes (${nombre(s.comptages.nb_comptages)} événement(s))</h3>
      <div class="grille-stats" style="margin-bottom:0">
        ${tuile(nombre(s.comptages.total_hommes), 'Hommes (cumulé)', { ton: 'accent' })}
        ${tuile(nombre(s.comptages.total_femmes), 'Femmes (cumulé)', { ton: 'accent' })}
        ${tuile(nombre(s.comptages.total_enfants), 'Enfants (cumulé)', { ton: 'accent' })}
        ${tuile(nombre(s.comptages.total_hommes + s.comptages.total_femmes + s.comptages.total_enfants), 'Total cumulé')}
      </div>
    </div>` : ''}

    <h2>Hiérarchie pastorale</h2>
    <div class="carte"><div class="hierarchie">
      ${s.par_role.map((r, i) => `
        <div class="echelon n${i + 1}">
          <span class="rang">${i + 1}</span>
          <div>
            <div class="titre-echelon">${esc(r.libelle)}</div>
            <div class="desc">${esc(etat.ref.roles[r.role].description)}</div>
          </div>
          <span class="effectif">${nombre(r.nb)}</span>
        </div>`).join('')}
    </div></div>

    <h2>${esc(lbl1)}</h2>
    ${tableauEquipes(s.par_tribu, 'tribus', 'Patriarche', 'patriarche')}

    <h2>${esc(lbl2)}</h2>
    ${tableauEquipes(s.par_departement, 'departements', 'Responsable', 'responsable')}`;
}

/** Tableau commun tribus / départements : effectif, meneur, taux de présence. */
function tableauEquipes(lignes, chemin, libelleMeneur, prefixe) {
  if (!lignes.length) {
    return `<p class="message-vide">Aucune entrée — créez-en dans l'onglet correspondant.</p>`;
  }
  return `<div class="carte conteneur-table"><table>
    <thead><tr>
      <th>Nom</th><th>${esc(libelleMeneur)}</th>
      <th class="numerique">Fidèles</th>
      <th style="min-width:104px">Taux de présence</th>
    </tr></thead>
    <tbody>${lignes.map((l) => {
      const photo = l[prefixe + '_photo'];
      const prenom = l[prefixe + '_prenom'];
      const nom = l[prefixe + '_nom'];
      const meneur = prenom
        ? `<span style="display:inline-flex;align-items:center;gap:6px">${avatarHtml(photo, prenom, nom, 28)} ${esc(prenom)} ${esc(nom)}</span>`
        : '<em style="color:var(--ambre)">à désigner</em>';
      return `<tr>
        <td><a href="#/${chemin}/${l.id}"><strong>${esc(l.nom)}</strong></a></td>
        <td>${meneur}</td>
        <td class="numerique">${nombre(l.nb_membres)}${l.nb_fiches_qr ? ` <span style="font-size:.75rem;color:var(--primaire)" title="Inscriptions QR">+${l.nb_fiches_qr} QR</span>` : ''}</td>
        <td>${jauge(l.taux_presence)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* ============ Statistiques détaillées ============ */

async function vueStatistiques(vue) {
  const s = await api.get('/stats/global');
  const e = s.effectifs;
  const lbl1 = etat.org ? etat.org.label_section1 || 'Tribus' : 'Tribus';
  const lbl2 = etat.org ? etat.org.label_section2 || 'Departements' : 'Departements';

  vue.innerHTML = `
    <h1>Statistiques</h1>
    <p class="sous-titre">Assiduité, effectifs, rôles, ${lbl1.toLowerCase()} et ${lbl2.toLowerCase()}.</p>

    <div class="grille-stats">
      ${tuile(nombre(e.fideles_actifs), 'Fidèles actifs', { ton: 'accent' })}
      ${tuile(nombre(e.pointages), 'Pointages cumulés')}
      ${tuile(pourcent(s.taux_presence_global), 'Présence globale', { ton: 'bien' })}
      ${tuile(nombre(s.alertes_absences.length), 'Fidèles en alerte', { ton: s.alertes_absences.length ? 'alerte' : '' })}
    </div>

    <h2>Effectif par ${lbl1.toLowerCase()}</h2>
    <div class="carte">${barres(s.par_tribu.map((t) => ({ etiquette: t.nom, valeur: t.nb_membres })))}</div>

    <h2>Taux de présence par ${lbl1.toLowerCase()}</h2>
    <div class="carte conteneur-table"><table>
      <thead><tr><th>${esc(lbl1)}</th><th class="numerique">Fidèles</th><th class="numerique">Pointages</th>
        <th style="min-width:104px">Présence</th></tr></thead>
      <tbody>${s.par_tribu.map((t) => `<tr>
        <td><a href="#/tribus/${t.id}"><strong>${esc(t.nom)}</strong></a></td>
        <td class="numerique">${nombre(t.nb_membres)}</td>
        <td class="numerique">${nombre(t.total)}</td>
        <td>${jauge(t.taux_presence)}</td>
      </tr>`).join('')}</tbody>
    </table></div>

    <h2>Effectif par ${lbl2.toLowerCase()}</h2>
    <div class="carte">${barres(s.par_departement.map((d) => ({ etiquette: d.nom, valeur: d.nb_membres })))}</div>

    <h2>Taux de présence par ${lbl2.toLowerCase()}</h2>
    <div class="carte conteneur-table"><table>
      <thead><tr><th>${esc(lbl2)}</th><th class="numerique">Membres</th><th class="numerique">Pointages</th>
        <th style="min-width:104px">Présence</th></tr></thead>
      <tbody>${s.par_departement.map((d) => `<tr>
        <td><a href="#/departements/${d.id}"><strong>${esc(d.nom)}</strong></a></td>
        <td class="numerique">${nombre(d.nb_membres)}</td>
        <td class="numerique">${nombre(d.total)}</td>
        <td>${jauge(d.taux_presence)}</td>
      </tr>`).join('')}</tbody>
    </table></div>

    <h2>Répartition par rôle</h2>
    <div class="carte">${barres(s.par_role.map((r) => ({ etiquette: r.libelle, valeur: r.nb })))}</div>

    <h2>Assiduité individuelle</h2>
    <div class="ligne-champs">
      <div class="carte">
        <h3>Les plus assidus</h3>
        ${listeAssiduite(s.plus_assidus)}
      </div>
      <div class="carte">
        <h3>À encourager</h3>
        ${listeAssiduite(s.moins_assidus)}
      </div>
    </div>
    <p class="aide">Classement établi sur les fidèles comptant au moins 3 pointages.</p>`;
}

function listeAssiduite(membres) {
  if (!membres || !membres.length) return '<p class="message-vide">Pas encore de données.</p>';
  return `<div class="barres">${membres.map((m) => `
    <div class="barre-ligne">
      <span class="etiquette"><a href="#/fideles/${m.id}">${esc(m.prenom)} ${esc(m.nom)}</a></span>
      <div class="barre-piste" title="${esc(m.prenom)} ${esc(m.nom)} : ${m.taux_presence}%">
        <div style="width:${m.taux_presence}%"></div></div>
      <span class="mesure">${m.taux_presence}%</span>
    </div>`).join('')}</div>`;
}

/* ============ Validation des comptes ============ */

async function vueValidations(vue) {
  const [tribus, departements, r] = await Promise.all([
    chargerTribus(), chargerDepartements(), api.get('/users?statut=en_attente'),
  ]);

  vue.innerHTML = `
    <h1>Validation des comptes</h1>
    <p class="sous-titre">Attribuez un rôle, une tribu et des départements pour activer chaque compte.</p>
    <div class="liste">
      ${r.users.map((u) => `<div class="element" data-id="${u.id}" style="flex-direction:column;align-items:stretch">
        <div class="infos">
          <div class="nom">${esc(u.prenom)} ${esc(u.nom)}</div>
          <div class="detail">${esc(u.email)}${u.telephone ? ' · ' + esc(u.telephone) : ''}</div>
          ${u.tribu_souhaitee ? `<div class="detail">Tribu souhaitée : <strong>${esc(u.tribu_souhaitee)}</strong></div>` : ''}
          ${u.departement_souhaite ? `<div class="detail">Département souhaité : <strong>${esc(u.departement_souhaite)}</strong></div>` : ''}
          <div class="detail">Inscrit le ${dateFr(u.created_at)}</div>
        </div>
        <div class="ligne-champs" style="margin-top:8px">
          <div><label>Rôle</label><select class="sel-role">${optionsRoles('fidele')}</select></div>
          <div><label>Tribu</label><select class="sel-tribu">${options(tribus, prechoisir(tribus, u.tribu_souhaitee), '— Aucune —')}</select></div>
        </div>
        <label>Départements</label>
        <div class="cases">${departements.map((d) => `<label>
          <input type="checkbox" value="${d.id}" ${estPrechoisi(d, u.departement_souhaite) ? 'checked' : ''}> ${esc(d.nom)}
        </label>`).join('')}</div>
        <div class="barre-actions" style="margin-top:12px">
          <button class="btn-petit btn-vert btn-valider">✓ Valider et activer</button>
          <button class="btn-petit btn-danger btn-rejeter">Rejeter</button>
        </div>
      </div>`).join('') || '<p class="message-vide">Aucun compte en attente. 👍</p>'}
    </div>`;

  vue.querySelectorAll('.element').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('.btn-valider').onclick = async () => {
      try {
        await api.post(`/users/${id}/valider`, {
          role: el.querySelector('.sel-role').value,
          tribu_id: el.querySelector('.sel-tribu').value || null,
          departement_ids: [...el.querySelectorAll('.cases input:checked')].map((c) => Number(c.value)),
        });
        toast('Compte validé et activé.');
        vueValidations(vue);
      } catch (err) { toast(err.message, true); }
    };
    el.querySelector('.btn-rejeter').onclick = async () => {
      if (!confirm('Rejeter cette demande de compte ?')) return;
      try { await api.post(`/users/${id}/rejeter`); toast('Compte rejeté.'); vueValidations(vue); }
      catch (err) { toast(err.message, true); }
    };
  });
}

/** Présélectionne la tribu correspondant au souhait exprimé à l'inscription. */
function prechoisir(liste, souhait) {
  if (!souhait) return null;
  const cible = String(souhait).trim().toLowerCase();
  const trouve = liste.find((o) => o.nom.toLowerCase() === cible);
  return trouve ? trouve.id : null;
}
function estPrechoisi(dept, souhait) {
  return !!souhait && dept.nom.toLowerCase() === String(souhait).trim().toLowerCase();
}

/* ============ Annuaire des fidèles ============ */

async function vueFideles(vue) {
  const direction = estDirection();
  const [tribus, departements] = await Promise.all([chargerTribus(), chargerDepartements()]);

  const filtres = vue._filtres || (vue._filtres = { tribu_id: '', departement_id: '', role: '', q: '' });
  const requete = new URLSearchParams();
  if (direction) requete.set('statut', 'actif');
  Object.entries(filtres).forEach(([k, v]) => { if (v) requete.set(k, v); });
  const r = await api.get('/users?' + requete.toString());

  vue.innerHTML = `
    <h1>${direction ? 'Fidèles de l\'assemblée' : 'Mes fidèles'}</h1>
    <p class="sous-titre">${nombre(r.users.length)} fidèle(s) affiché(s).</p>

    <div class="carte filtres">
      <div><label>Rechercher</label><input id="f-q" value="${esc(filtres.q)}" placeholder="nom, prénom, email…"></div>
      <div><label>Tribu</label><select id="f-tribu">${options(tribus, filtres.tribu_id, 'Toutes les tribus')}</select></div>
      <div><label>Département</label><select id="f-dept">${options(departements, filtres.departement_id, 'Tous les départements')}</select></div>
      <div><label>Rôle</label><select id="f-role">
        <option value="">Tous les rôles</option>
        ${etat.ref.ordre_roles.map((c) => `<option value="${c}" ${filtres.role === c ? 'selected' : ''}>${esc(libelleRole(c))}</option>`).join('')}
      </select></div>
    </div>

    <div class="liste">
      ${r.users.map((u) => `<div class="element" data-id="${u.id}">
        <div class="infos">
          <div class="nom"><a href="#/fideles/${u.id}">${esc(u.prenom)} ${esc(u.nom)}</a> ${badgeRole(u.role)}</div>
          <div class="detail">${esc(u.email)}${u.telephone ? ' · 📞 ' + esc(u.telephone) : ''}${u.whatsapp ? ' · 💬 ' + esc(u.whatsapp) : ''}</div>
          <div class="detail">
            ${u.tribu_nom ? 'Tribu <strong>' + esc(u.tribu_nom) + '</strong>' : '<em>Sans tribu</em>'}
            ${u.departements.length ? ' · ' + u.departements.map((d) => esc(d.nom)).join(', ') : ' · <em>aucun département</em>'}
          </div>
        </div>
        ${direction && u.id !== etat.user.id ? `<div class="actions">
          <a class="btn btn-petit btn-secondaire" href="#/fideles/${u.id}">Fiche</a>
        </div>` : ''}
      </div>`).join('') || '<p class="message-vide">Aucun fidèle ne correspond à ces critères.</p>'}
    </div>`;

  const relancer = (champ) => (ev) => { filtres[champ] = ev.target.value; vueFideles(vue); };
  document.getElementById('f-tribu').onchange = relancer('tribu_id');
  document.getElementById('f-dept').onchange = relancer('departement_id');
  document.getElementById('f-role').onchange = relancer('role');
  const champQ = document.getElementById('f-q');
  champQ.onchange = relancer('q');
  champQ.onkeydown = (ev) => { if (ev.key === 'Enter') relancer('q')(ev); };
}

/* ============ Fiche d'un fidèle ============ */

async function vueFicheFidele(vue, id) {
  const direction = estDirection();
  const [r, tribus, departements] = await Promise.all([
    api.get('/users/' + id),
    direction ? chargerTribus() : Promise.resolve([]),
    direction ? chargerDepartements() : Promise.resolve([]),
  ]);
  const m = r.membre;
  const a = r.assiduite;

  vue.innerHTML = `
    <a href="#/fideles" class="btn btn-petit btn-neutre retour">← Retour aux fidèles</a>
    <div class="entete-page">
      <div style="display:flex;align-items:center;gap:16px">
        <div class="photo-profil-conteneur-compact" id="zone-photo-fiche">
          ${m.photo
            ? `<img src="${urlPhoto(m.photo)}" alt="Photo" class="photo-profil" style="width:64px;height:64px">`
            : avatarHtml(null, m.prenom, m.nom, 64)}
        </div>
        <div>
          <h1 style="margin:0">${esc(m.prenom)} ${esc(m.nom)}</h1>
          <p class="sous-titre" style="margin:0">${badgeRole(m.role)}
            ${m.tribu_nom ? ' · Tribu <strong>' + esc(m.tribu_nom) + '</strong>' : ' · sans tribu'}</p>
        </div>
      </div>
      ${direction ? `<label class="btn btn-petit btn-secondaire" style="cursor:pointer">
        Photo <input type="file" id="input-photo-fidele" accept="image/*" hidden>
      </label>` : ''}
    </div>

    <div class="grille-stats">
      ${tuile(pourcent(a.taux), 'Taux de présence', { ton: a.taux !== null && a.taux < 60 ? 'alerte' : 'bien' })}
      ${tuile(nombre(a.presents), 'Présences', { appoint: `sur ${nombre(a.total)} pointage(s)` })}
      ${tuile(nombre(a.absents), 'Absences', { ton: a.absents ? 'alerte' : '' })}
      ${tuile(nombre(a.excuses), 'Excusé(e)')}
    </div>

    <div class="carte">
      <h3>Coordonnées</h3>
      <div class="detail">📧 ${esc(m.email)}</div>
      ${m.telephone ? `<div class="detail">📞 ${esc(m.telephone)}</div>` : ''}
      ${m.whatsapp ? `<div class="detail">💬 ${esc(m.whatsapp)}</div>` : ''}
      ${m.date_naissance ? `<div class="detail">🎂 ${dateFr(m.date_naissance)}</div>` : ''}
      <div class="detail">Départements : ${m.departements.length
        ? m.departements.map((d) => `<span class="badge badge-teal">${esc(d.nom)}</span>`).join(' ')
        : '<em>aucun</em>'}</div>
    </div>

    ${direction ? `<div class="carte">
      <h3>Affectation</h3>
      <div class="ligne-champs">
        <div><label>Rôle</label><select id="m-role">${optionsRoles(m.role)}</select></div>
        <div><label>Tribu</label><select id="m-tribu">${options(tribus, m.tribu_id, '— Aucune —')}</select></div>
      </div>
      <label>Départements</label>
      <div class="cases" id="m-depts">${departements.map((d) => `<label>
        <input type="checkbox" value="${d.id}" ${m.departements.some((x) => x.id === d.id) ? 'checked' : ''}> ${esc(d.nom)}
      </label>`).join('')}</div>
      <div class="barre-actions" style="margin-top:14px">
        <button id="btn-enregistrer-membre">Enregistrer l'affectation</button>
        ${m.id !== etat.user.id ? '<button class="btn-danger" id="btn-supprimer-membre">Supprimer le compte</button>' : ''}
      </div>
    </div>` : ''}

    <h2>Historique de présence</h2>
    <div class="liste">
      ${r.historique.map((h) => `<div class="element">
        <div class="infos">
          <div class="nom">${esc(h.titre)}</div>
          <div class="detail">${esc(etat.ref.types_evenement[h.type] || h.type)} · ${dateFr(h.date)}</div>
        </div>
        ${badgePresence(h.statut)}
      </div>`).join('') || '<p class="message-vide">Aucun pointage enregistré pour ce fidèle.</p>'}
    </div>`;

  if (!direction) return;

  document.getElementById('btn-enregistrer-membre').onclick = async () => {
    try {
      await api.put('/users/' + id, {
        role: document.getElementById('m-role').value,
        tribu_id: document.getElementById('m-tribu').value || null,
        departement_ids: [...document.querySelectorAll('#m-depts input:checked')].map((c) => Number(c.value)),
      });
      toast('Affectation enregistrée.');
      vueFicheFidele(vue, id);
    } catch (err) { toast(err.message, true); }
  };
  const btnSuppr = document.getElementById('btn-supprimer-membre');
  if (btnSuppr) btnSuppr.onclick = async () => {
    if (!confirm('Supprimer définitivement ce compte et tout son historique ?')) return;
    try { await api.del('/users/' + id); toast('Compte supprimé.'); location.hash = '#/fideles'; }
    catch (err) { toast(err.message, true); }
  };

  const inputPhotoFidele = document.getElementById('input-photo-fidele');
  if (inputPhotoFidele) inputPhotoFidele.onchange = async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    const fd = new FormData();
    fd.append('photo', fichier);
    try {
      await api.upload(`/uploads/photo/${id}`, fd);
      toast('Photo mise à jour.');
      vueFicheFidele(vue, id);
    } catch (err) { toast(err.message, true); }
  };
}

/* ============ Administration des tribus ============ */

async function vueTribus(vue) {
  const [tribus, membres] = await Promise.all([
    chargerTribus(), api.get('/users?statut=actif').then((r) => r.users),
  ]);
  const lbl1 = etat.org ? etat.org.label_section1 || 'Tribus' : 'Tribus';

  vue.innerHTML = `
    <h1>${esc(lbl1)}</h1>
    <p class="sous-titre">Chaque ${lbl1.toLowerCase().replace(/s$/, '')} est conduit(e) par un patriarche, qui pointe la présence de ses fidèles.</p>

    <div class="grille-cartes">
      ${tribus.map((t) => `<a class="carte-equipe ${t.patriarche_id ? '' : 'sans-responsable'}" href="#/tribus/${t.id}">
        <div class="titre">${esc(t.nom)}</div>
        <div class="meneur">${t.patriarche_id
          ? `<span style="display:inline-flex;align-items:center;gap:6px">${avatarHtml(t.patriarche_photo, t.patriarche_prenom, t.patriarche_nom, 24)} ${esc(t.patriarche_prenom)} ${esc(t.patriarche_nom)}</span>`
          : '<em>Patriarche à désigner</em>'}</div>
        <div class="chiffres"><div><strong>${nombre(t.nb_membres)}</strong> fidèle(s)</div></div>
      </a>`).join('') || '<p class="message-vide">Aucune tribu.</p>'}
    </div>

    <h2>Désigner les patriarches</h2>
    <div class="liste">
      ${tribus.map((t) => `<div class="element" data-id="${t.id}">
        <div class="infos">
          <div class="nom">${esc(t.nom)}</div>
          <div class="detail">${nombre(t.nb_membres)} fidèle(s)${t.description ? ' · ' + esc(t.description) : ''}</div>
        </div>
        <div class="actions">
          <select class="sel-patriarche">
            <option value="">— Aucun patriarche —</option>
            ${membres.map((u) => `<option value="${u.id}" ${t.patriarche_id === u.id ? 'selected' : ''}>
              ${esc(u.prenom)} ${esc(u.nom)}${u.tribu_nom ? ' (' + esc(u.tribu_nom) + ')' : ''}</option>`).join('')}
          </select>
          <button class="btn-petit btn-secondaire btn-maj">Enregistrer</button>
          <button class="btn-petit btn-danger btn-suppr">Supprimer</button>
        </div>
      </div>`).join('')}
    </div>

    <h2>Ajouter</h2>
    <div class="carte">
      <form id="form-tribu">
        <div class="ligne-champs">
          <div><label>Nom *</label><input name="nom" required placeholder="ex. SIMGAD"></div>
          <div><label>Description</label><input name="description"></div>
        </div>
        <button class="btn-bloc" type="submit">Créer la tribu</button>
      </form>
      <p class="aide" style="margin-top:12px">Les 6 tribus officielles manquantes peuvent être recréées d'un clic.</p>
      <button class="btn-petit btn-neutre" id="btn-init-tribus">Restaurer les tribus officielles</button>
    </div>`;

  document.getElementById('form-tribu').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tribus', Object.fromEntries(new FormData(e.target)));
      toast('Tribu créée.');
      vueTribus(vue);
    } catch (err) { toast(err.message, true); }
  };
  document.getElementById('btn-init-tribus').onclick = async () => {
    try {
      const r = await api.post('/tribus/initialiser');
      toast(r.ajouts ? `${r.ajouts} tribu(s) ajoutée(s).` : 'Les 6 tribus sont déjà présentes.');
      vueTribus(vue);
    } catch (err) { toast(err.message, true); }
  };

  vue.querySelectorAll('.element').forEach((el) => {
    const id = el.dataset.id;
    const tribu = tribus.find((t) => t.id === Number(id));
    el.querySelector('.btn-maj').onclick = async () => {
      try {
        await api.put('/tribus/' + id, {
          nom: tribu.nom,
          description: tribu.description,
          patriarche_id: el.querySelector('.sel-patriarche').value || null,
        });
        toast('Patriarche mis à jour.');
        vueTribus(vue);
      } catch (err) { toast(err.message, true); }
    };
    el.querySelector('.btn-suppr').onclick = async () => {
      if (!confirm(`Supprimer la tribu « ${tribu.nom} » ? Ses fidèles seront détachés mais conservés.`)) return;
      try { await api.del('/tribus/' + id); toast('Tribu supprimée.'); vueTribus(vue); }
      catch (err) { toast(err.message, true); }
    };
  });
}

/* ============ Évolution de l'église (bilans mensuels) ============ */

async function vueEvolution(vue) {
  const r = await api.get('/stats/bilans');
  const bilans = r.bilans || [];
  const bilansChrono = bilans.slice().reverse();

  vue.innerHTML = `
    <h1>Évolution de l'église</h1>
    <p class="sous-titre">Bilans mensuels sauvegardés — suivez la croissance et l'assiduité mois par mois.</p>

    <div class="carte">
      <h3>Sauvegarder le bilan du mois</h3>
      <p class="aide" style="margin:0 0 10px">Calcule un instantané complet (effectifs, présences, comptages) et le stocke.
        Relancer sur un mois déjà sauvegardé met à jour les chiffres.</p>
      <div class="barre-actions">
        <input type="month" id="mois-bilan" value="${aujourdhui().slice(0, 7)}" style="flex:0 0 auto;width:auto">
        <button id="btn-sauver-bilan" class="btn-petit">Sauvegarder le bilan</button>
      </div>
    </div>

    ${bilansChrono.length ? `
    <h2>Courbe d'évolution</h2>
    <div class="carte">
      <h3>Fidèles actifs</h3>
      ${colonnesEvolutionBilans(bilansChrono, 'fideles_actifs', (v) => nombre(v))}
    </div>
    <div class="carte">
      <h3>Taux de présence</h3>
      ${colonnesEvolution(bilansChrono.map((b) => ({ mois: b.mois, total: b.nb_pointages || 1, taux: b.taux_presence ?? 0 })))}
    </div>
    <div class="carte">
      <h3>Comptage par culte (cumulé mensuel)</h3>
      ${colonnesComptagesBilans(bilansChrono)}
    </div>

    <h2>Détail mois par mois</h2>
    <div class="carte conteneur-table"><table>
      <thead><tr>
        <th>Mois</th><th class="numerique">Fidèles</th><th class="numerique">Nouveaux</th>
        <th class="numerique">Événements</th><th class="numerique">Cultes</th>
        <th class="numerique">Pointages</th><th>Présence</th>
        <th class="numerique">H</th><th class="numerique">F</th><th class="numerique">Enf.</th>
      </tr></thead>
      <tbody>${bilans.map((b) => `<tr>
        <td><strong>${moisFr(b.mois)}</strong></td>
        <td class="numerique">${nombre(b.fideles_actifs)}</td>
        <td class="numerique">${nombre(b.nouveaux_inscrits)}</td>
        <td class="numerique">${nombre(b.nb_evenements)}</td>
        <td class="numerique">${nombre(b.nb_cultes)}</td>
        <td class="numerique">${nombre(b.nb_pointages)}</td>
        <td>${jauge(b.taux_presence)}</td>
        <td class="numerique">${nombre(b.comptage_hommes)}</td>
        <td class="numerique">${nombre(b.comptage_femmes)}</td>
        <td class="numerique">${nombre(b.comptage_enfants)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    ` : '<div class="encart-info">Aucun bilan sauvegardé. Cliquez sur « Sauvegarder le bilan » pour commencer le suivi.</div>'}`;

  document.getElementById('btn-sauver-bilan').onclick = async () => {
    const mois = document.getElementById('mois-bilan').value;
    if (!mois) return toast('Choisissez un mois.', true);
    const btn = document.getElementById('btn-sauver-bilan');
    btn.disabled = true;
    try {
      await api.post('/stats/bilan', { mois });
      toast(`Bilan de ${moisFr(mois)} sauvegardé.`);
      vueEvolution(vue);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  };
}

function colonnesEvolutionBilans(bilans, champ, format) {
  if (!bilans.length) return '<p class="message-vide">Pas encore de données.</p>';
  const max = Math.max(...bilans.map((b) => b[champ] || 0), 1);
  return `
    <div class="colonnes">
      ${bilans.map((b) => {
        const val = b[champ] || 0;
        const pct = Math.round((val / max) * 100);
        return `<div class="colonne" title="${moisFr(b.mois)} : ${format(val)}">
          <span class="val">${format(val)}</span>
          <div class="tige" style="height:${Math.max(pct, 1)}%"></div>
        </div>`;
      }).join('')}
    </div>
    <div class="axe-mois">${bilans.map((b) => `<span>${moisFr(b.mois)}</span>`).join('')}</div>`;
}

function colonnesComptagesBilans(bilans) {
  if (!bilans.length) return '<p class="message-vide">Pas encore de données.</p>';
  const max = Math.max(...bilans.map((b) => (b.comptage_hommes || 0) + (b.comptage_femmes || 0) + (b.comptage_enfants || 0)), 1);
  return `
    <div class="colonnes">
      ${bilans.map((b) => {
        const total = (b.comptage_hommes || 0) + (b.comptage_femmes || 0) + (b.comptage_enfants || 0);
        const pct = Math.round((total / max) * 100);
        return `<div class="colonne" title="${moisFr(b.mois)} : ${nombre(total)} (${nombre(b.comptage_hommes || 0)} H · ${nombre(b.comptage_femmes || 0)} F · ${nombre(b.comptage_enfants || 0)} enf.)">
          <span class="val">${nombre(total)}</span>
          <div class="tige" style="height:${Math.max(pct, 1)}%"></div>
        </div>`;
      }).join('')}
    </div>
    <div class="axe-mois">${bilans.map((b) => `<span>${moisFr(b.mois)}</span>`).join('')}</div>`;
}

/* ============ Administration des départements ============ */

async function vueDepartements(vue) {
  const [departements, membres] = await Promise.all([
    chargerDepartements(), api.get('/users?statut=actif').then((r) => r.users),
  ]);
  const lbl2 = etat.org ? etat.org.label_section2 || 'Departements' : 'Departements';

  vue.innerHTML = `
    <h1>${esc(lbl2)}</h1>
    <p class="sous-titre">Chaque ${lbl2.toLowerCase().replace(/s$/, '')} est conduit(e) par un responsable, qui pointe la présence de ses membres.</p>

    <div class="grille-cartes">
      ${departements.map((d) => `<a class="carte-equipe ${d.responsable_id ? '' : 'sans-responsable'}" href="#/departements/${d.id}">
        <div class="titre">${esc(d.nom)}</div>
        <div class="meneur">${d.responsable_id
          ? `<span style="display:inline-flex;align-items:center;gap:6px">${avatarHtml(d.responsable_photo, d.responsable_prenom, d.responsable_nom, 24)} ${esc(d.responsable_prenom)} ${esc(d.responsable_nom)}</span>`
          : '<em>Responsable à désigner</em>'}</div>
        <div class="chiffres"><div><strong>${nombre(d.nb_membres)}</strong> membre(s)</div></div>
      </a>`).join('') || '<p class="message-vide">Aucun département.</p>'}
    </div>

    <h2>Désigner les responsables</h2>
    <div class="liste">
      ${departements.map((d) => `<div class="element" data-id="${d.id}">
        <div class="infos">
          <div class="nom">${esc(d.nom)}</div>
          <div class="detail">${nombre(d.nb_membres)} membre(s)${d.description ? ' · ' + esc(d.description) : ''}</div>
        </div>
        <div class="actions">
          <select class="sel-responsable">
            <option value="">— Aucun responsable —</option>
            ${membres.map((u) => `<option value="${u.id}" ${d.responsable_id === u.id ? 'selected' : ''}>
              ${esc(u.prenom)} ${esc(u.nom)}</option>`).join('')}
          </select>
          <button class="btn-petit btn-secondaire btn-maj">Enregistrer</button>
          <button class="btn-petit btn-danger btn-suppr">Supprimer</button>
        </div>
      </div>`).join('')}
    </div>

    <h2>Ajouter</h2>
    <div class="carte">
      <form id="form-dept">
        <div class="ligne-champs">
          <div><label>Nom *</label><input name="nom" required placeholder="ex. PROTOCOLE"></div>
          <div><label>Description</label><input name="description"></div>
        </div>
        <button class="btn-bloc" type="submit">Créer le département</button>
      </form>
      <p class="aide" style="margin-top:12px">Les 13 départements officiels manquants peuvent être recréés d'un clic.</p>
      <button class="btn-petit btn-neutre" id="btn-init-depts">Restaurer les départements officiels</button>
    </div>`;

  document.getElementById('form-dept').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/departements', Object.fromEntries(new FormData(e.target)));
      toast('Département créé.');
      vueDepartements(vue);
    } catch (err) { toast(err.message, true); }
  };
  document.getElementById('btn-init-depts').onclick = async () => {
    try {
      const r = await api.post('/departements/initialiser');
      toast(r.ajouts ? `${r.ajouts} département(s) ajouté(s).` : 'Les 13 départements sont déjà présents.');
      vueDepartements(vue);
    } catch (err) { toast(err.message, true); }
  };

  vue.querySelectorAll('.element').forEach((el) => {
    const id = el.dataset.id;
    const dept = departements.find((d) => d.id === Number(id));
    el.querySelector('.btn-maj').onclick = async () => {
      try {
        await api.put('/departements/' + id, {
          nom: dept.nom,
          description: dept.description,
          responsable_id: el.querySelector('.sel-responsable').value || null,
        });
        toast('Responsable mis à jour.');
        vueDepartements(vue);
      } catch (err) { toast(err.message, true); }
    };
    el.querySelector('.btn-suppr').onclick = async () => {
      if (!confirm(`Supprimer le département « ${dept.nom} » ? Ses membres seront désaffectés mais conservés.`)) return;
      try { await api.del('/departements/' + id); toast('Département supprimé.'); vueDepartements(vue); }
      catch (err) { toast(err.message, true); }
    };
  });
}

/* ============ QR Code d'inscription ============ */

const QR = (() => {
  const EC_L = 1, EC_M = 0;
  const CAPACITY = [,[17,14],[32,26],[53,42],[78,62],[106,84],[134,106],[154,122],[192,152],[230,180],[271,213]];
  const EC_BLOCKS = [,[[1,7,19],[1,10,16]],[[1,10,34],[1,16,28]],[[1,15,55],[1,26,44]],[[1,20,80],[2,18,32]],[[1,26,108],[2,24,43]],[[2,18,68],[4,16,27]],[[2,20,78],[4,18,31]],[[2,24,97],[4,20,38]],[[2,30,116],[3,22,36,1,24,37]],[[2,18,68,2,20,70],[4,26,43,1,22,44]]];
  const ALIGN = [,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
  const GF256 = new Uint8Array(256), GF_LOG = new Uint8Array(256);
  { let v = 1; for (let i = 0; i < 255; i++) { GF256[i] = v; GF_LOG[v] = i; v = (v << 1) ^ (v >= 128 ? 0x11d : 0); } }
  function gfMul(a, b) { return a && b ? GF256[(GF_LOG[a] + GF_LOG[b]) % 255] : 0; }
  function polyMul(p, q) { const r = new Uint8Array(p.length + q.length - 1); for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) r[i + j] ^= gfMul(p[i], q[j]); return r; }
  function ecPoly(n) { let p = new Uint8Array([1]); for (let i = 0; i < n; i++) p = polyMul(p, new Uint8Array([1, GF256[i]])); return p; }
  function ecEncode(data, ecLen) { const gen = ecPoly(ecLen); const msg = new Uint8Array(data.length + ecLen); msg.set(data); for (let i = 0; i < data.length; i++) { const coef = msg[i]; if (!coef) continue; for (let j = 0; j < gen.length; j++) msg[i + j] ^= gfMul(gen[j], coef); } return msg.slice(data.length); }
  function encode(text) {
    const bytes = new TextEncoder().encode(text); const len = bytes.length;
    let ver = 0, ecLevel = EC_L;
    for (let v = 1; v <= 10; v++) { if (CAPACITY[v][ecLevel] >= len + 3) { ver = v; break; } }
    if (!ver) { ecLevel = EC_M; for (let v = 1; v <= 10; v++) { if (CAPACITY[v][ecLevel] >= len + 3) { ver = v; break; } } }
    if (!ver) throw new Error('Texte trop long');
    const size = ver * 4 + 17; const totalData = CAPACITY[ver][ecLevel];
    const dataBits = [];
    function push(val, bits) { for (let i = bits - 1; i >= 0; i--) dataBits.push((val >> i) & 1); }
    push(4, 4); push(len, ver <= 9 ? 8 : 16);
    for (const b of bytes) push(b, 8);
    push(0, Math.min(4, totalData * 8 - dataBits.length));
    while (dataBits.length % 8) dataBits.push(0);
    while (dataBits.length < totalData * 8) { push(0xec, 8); if (dataBits.length < totalData * 8) push(0x11, 8); }
    const dataBytes = new Uint8Array(totalData);
    for (let i = 0; i < totalData; i++) { let v2 = 0; for (let b = 0; b < 8; b++) v2 = (v2 << 1) | dataBits[i * 8 + b]; dataBytes[i] = v2; }
    const blockInfo = EC_BLOCKS[ver][ecLevel]; const blocks = [], ecBlocks = []; let offset = 0;
    for (let i = 0; i < blockInfo.length; i += 3) { const count = blockInfo[i], ecCw = blockInfo[i + 1], dataCw = blockInfo[i + 2]; for (let j = 0; j < count; j++) { const block = dataBytes.slice(offset, offset + dataCw); blocks.push(block); ecBlocks.push(ecEncode(block, ecCw)); offset += dataCw; } }
    const interleaved = []; const maxData = Math.max(...blocks.map(b => b.length));
    for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) interleaved.push(b[i]);
    const maxEc = Math.max(...ecBlocks.map(b => b.length));
    for (let i = 0; i < maxEc; i++) for (const b of ecBlocks) if (i < b.length) interleaved.push(b[i]);
    const grid = Array.from({ length: size }, () => new Uint8Array(size));
    const reserved = Array.from({ length: size }, () => new Uint8Array(size));
    function setMod(r, c, v) { grid[r][c] = v ? 1 : 0; reserved[r][c] = 1; }
    function finderPattern(row, col) { for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) { const r = row + dr, c = col + dc; if (r < 0 || r >= size || c < 0 || c >= size) continue; const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6; const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4; const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6; setMod(r, c, inInner || (inOuter && onBorder) ? 1 : 0); } }
    finderPattern(0, 0); finderPattern(0, size - 7); finderPattern(size - 7, 0);
    for (let i = 0; i < size; i++) { if (!reserved[6][i]) setMod(6, i, i % 2 === 0); if (!reserved[i][6]) setMod(i, 6, i % 2 === 0); }
    setMod(size - 8, 8, 1);
    const alignPos = ALIGN[ver];
    if (alignPos.length > 1) { for (const r of alignPos) for (const c of alignPos) { if (reserved[r][c]) continue; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { setMod(r + dr, c + dc, Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0) ? 1 : 0); } } }
    for (let i = 0; i < 8; i++) { reserved[8][i] = 1; reserved[8][size - 1 - i] = 1; reserved[i][8] = 1; reserved[size - 1 - i][8] = 1; }
    reserved[8][8] = 1;
    let bitIdx = 0;
    for (let col = size - 1; col >= 1; col -= 2) { if (col === 6) col = 5; for (let cnt = 0; cnt < size; cnt++) { const row = ((Math.floor((size - 1 - col) / 2)) % 2 === 0) ? size - 1 - cnt : cnt; for (let dx = 0; dx <= 1; dx++) { const c = col - dx; if (reserved[row][c]) continue; if (bitIdx < interleaved.length * 8) { grid[row][c] = (interleaved[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1; bitIdx++; } } } }
    let bestMask = 0, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) { const test = grid.map(r => r.slice()); for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) { if (reserved[r][c]) continue; let flip = false; switch (mask) { case 0: flip = (r + c) % 2 === 0; break; case 1: flip = r % 2 === 0; break; case 2: flip = c % 3 === 0; break; case 3: flip = (r + c) % 3 === 0; break; case 4: flip = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break; case 5: flip = (r * c) % 2 + (r * c) % 3 === 0; break; case 6: flip = ((r * c) % 2 + (r * c) % 3) % 2 === 0; break; case 7: flip = ((r + c) % 2 + (r * c) % 3) % 2 === 0; break; } if (flip) test[r][c] ^= 1; } let score = 0; for (let r = 0; r < size; r++) { let run = 1; for (let c = 1; c < size; c++) { if (test[r][c] === test[r][c - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1; } } for (let c = 0; c < size; c++) { let run = 1; for (let r = 1; r < size; r++) { if (test[r][c] === test[r - 1][c]) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1; } } if (score < bestScore) { bestScore = score; bestMask = mask; } }
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) { if (reserved[r][c]) continue; let flip = false; switch (bestMask) { case 0: flip = (r + c) % 2 === 0; break; case 1: flip = r % 2 === 0; break; case 2: flip = c % 3 === 0; break; case 3: flip = (r + c) % 3 === 0; break; case 4: flip = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break; case 5: flip = (r * c) % 2 + (r * c) % 3 === 0; break; case 6: flip = ((r * c) % 2 + (r * c) % 3) % 2 === 0; break; case 7: flip = ((r + c) % 2 + (r * c) % 3) % 2 === 0; break; } if (flip) grid[r][c] ^= 1; }
    const FORMAT_BITS = [0x77c4,0x72f3,0x7daa,0x789d,0x662f,0x6318,0x6c41,0x6976,0x5412,0x5125,0x5e7c,0x5b4b,0x45f9,0x40ce,0x4f97,0x4aa0,0x355f,0x3068,0x3f31,0x3a06,0x24b4,0x2183,0x2eda,0x2bed,0x1689,0x13be,0x1ce7,0x19d0,0x0762,0x0255,0x0d0c,0x083b];
    const fmt = FORMAT_BITS[ecLevel * 8 + bestMask]; const fmtBits = []; for (let i = 14; i >= 0; i--) fmtBits.push((fmt >> i) & 1);
    const p1 = [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]];
    const p2 = [[8,size-1],[8,size-2],[8,size-3],[8,size-4],[8,size-5],[8,size-6],[8,size-7],[8,size-8],[size-7,8],[size-6,8],[size-5,8],[size-4,8],[size-3,8],[size-2,8],[size-1,8]];
    for (let i = 0; i < 15; i++) { grid[p1[i][0]][p1[i][1]] = fmtBits[i]; grid[p2[i][0]][p2[i][1]] = fmtBits[i]; }
    return { grid, size };
  }
  function toSvg(text, scale) {
    const { grid, size } = encode(text); const m = 4, t = size + m * 2;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${t * (scale || 8)}" height="${t * (scale || 8)}"><rect width="${t}" height="${t}" fill="#fff"/>`;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c]) svg += `<rect x="${c + m}" y="${r + m}" width="1" height="1" fill="#000"/>`;
    return svg + '</svg>';
  }
  return { toSvg };
})();

async function vueQRCode(vue) {
  const orgSlug = etat.org ? etat.org.slug : '';
  const orgNom = etat.org ? etat.org.nom : 'ZAURA';
  const lienFiche = location.origin + '/fiche.html?slug=' + encodeURIComponent(orgSlug);
  let svgContent;
  try { svgContent = QR.toSvg(lienFiche, 6); }
  catch { svgContent = '<p style="color:var(--rouge)">Impossible de generer le QR code.</p>'; }

  vue.innerHTML = `
    <h1>QR Code d'inscription</h1>
    <p class="sous-titre">Partagez ce QR code dans votre groupe WhatsApp.
      Chaque personne qui le scanne pourra remplir sa fiche membre.</p>
    <div class="carte" style="text-align:center">
      <div id="qr-container" style="display:inline-block;background:#fff;padding:16px;border-radius:12px;border:2px solid var(--bordure)">
        ${svgContent}
      </div>
      <p style="margin-top:12px;font-size:.85rem;color:var(--texte-doux)">
        Lien du formulaire : <a href="${esc(lienFiche)}" target="_blank" style="color:var(--primaire);word-break:break-all">${esc(lienFiche)}</a>
      </p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px">
        <button class="btn-petit" id="btn-telecharger">Telecharger le QR code</button>
        <button class="btn-petit btn-secondaire" id="btn-copier-lien">Copier le lien</button>
      </div>
    </div>
    <div class="encart-info" style="margin-top:16px">
      <strong>Comment partager :</strong><br>
      1. Telechargez l'image du QR code ci-dessus<br>
      2. Envoyez-la dans votre groupe WhatsApp avec un message du type :<br>
      <em>"Scannez ce QR code pour remplir votre fiche membre — ${esc(orgNom)}"</em><br>
      3. Les fiches remplies apparaitront dans l'onglet <a href="#/fiches">Fiches</a>
    </div>`;

  document.getElementById('btn-telecharger').onclick = () => {
    const svg = document.querySelector('#qr-container svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.download = 'qrcode-' + (orgSlug || 'zaura') + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };
  document.getElementById('btn-copier-lien').onclick = async () => {
    try { await navigator.clipboard.writeText(lienFiche); toast('Lien copie dans le presse-papiers.'); }
    catch { toast('Impossible de copier le lien.', true); }
  };
}

/* ============ Fiches membres recues ============ */

async function vueFiches(vue) {
  const r = await api.get('/fiches');
  const fiches = r.fiches;

  const grouperPar = (champ) => {
    const groupes = {};
    fiches.forEach((f) => {
      const v = f[champ] || 'Non renseigne';
      if (!groupes[v]) groupes[v] = [];
      groupes[v].push(f);
    });
    const sans = ['Sans tribu', 'Sans departement', 'Non renseigne'];
    return Object.entries(groupes).sort((a, b) => {
      const aS = sans.includes(a[0]) ? 1 : 0;
      const bS = sans.includes(b[0]) ? 1 : 0;
      if (aS !== bS) return aS - bS;
      return a[0].localeCompare(b[0]);
    });
  };

  let modeVue = 'tribu';

  function rendu() {
    const groupes = grouperPar(modeVue === 'tribu' ? 'tribu' : 'departement');
    const labelSans = modeVue === 'tribu' ? 'Sans tribu' : 'Sans departement';

    vue.innerHTML = `
      <h1>Membres inscrits</h1>
      <p class="sous-titre">${fiches.length} membre(s) inscrit(s) via le QR code.</p>

      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn-petit ${modeVue === 'tribu' ? '' : 'btn-secondaire'}" id="btn-par-tribu">Par tribu</button>
        <button class="btn-petit ${modeVue === 'departement' ? '' : 'btn-secondaire'}" id="btn-par-dept">Par departement</button>
      </div>

      ${!fiches.length ? '<p class="message-vide">Aucun membre inscrit pour le moment. Partagez le <a href="#/qrcode">QR code</a> pour commencer.</p>' :
        groupes.map(([nom, membres]) => {
          const estSans = nom === labelSans || nom === 'Non renseigne';
          const badgeClasse = estSans ? 'badge-gris' : (modeVue === 'tribu' ? 'badge-teal' : 'badge-or');
          return `
          <div class="carte" style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <h3 style="margin:0;font-size:1rem">
                <span class="badge ${badgeClasse}">${esc(nom)}</span>
              </h3>
              <span style="font-size:.85rem;color:var(--texte-doux)">${membres.length} membre(s)</span>
            </div>
            <div class="liste">
              ${membres.map((f) => `<div class="element" data-id="${f.id}" style="border-bottom:1px solid var(--bordure);padding:8px 0">
                <div class="infos">
                  <div class="nom">${esc(f.prenom)} ${esc(f.nom)}</div>
                  <div class="detail" style="font-size:.85rem">
                    ${modeVue === 'tribu' && f.departement ? '<span class="badge badge-or" style="font-size:.75rem">' + esc(f.departement) + '</span> ' : ''}
                    ${modeVue === 'departement' && f.tribu ? '<span class="badge badge-teal" style="font-size:.75rem">' + esc(f.tribu) + '</span> ' : ''}
                    ${f.telephone ? 'Tel : ' + esc(f.telephone) + ' · ' : ''}
                    ${f.adresse ? esc(f.adresse) + ' · ' : ''}
                    ${f.date_naissance ? 'Ne(e) le ' + dateFr(f.date_naissance) : ''}
                  </div>
                </div>
                <div class="actions">
                  <button class="btn-petit btn-danger btn-suppr">Supprimer</button>
                </div>
              </div>`).join('')}
            </div>
          </div>`;
        }).join('')}`;

    document.getElementById('btn-par-tribu').onclick = () => { modeVue = 'tribu'; rendu(); };
    document.getElementById('btn-par-dept').onclick = () => { modeVue = 'departement'; rendu(); };

    vue.querySelectorAll('.btn-suppr').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Supprimer cette fiche ?')) return;
        try { await api.del('/fiches/' + b.closest('.element').dataset.id); toast('Fiche supprimee.'); vueFiches(vue); }
        catch (err) { toast(err.message, true); }
      };
    });
  }

  rendu();
}

/* ============ Versets bibliques en direct ============ */

async function vueVersets(vue) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    vue.innerHTML = `<h1>Versets en direct</h1>
      <div class="encart-alerte">Votre navigateur ne supporte pas la reconnaissance vocale.
      Utilisez <strong>Google Chrome</strong> sur ordinateur ou Android.</div>`;
    return;
  }

  const LIVRES_REGEX = [
    'genese','exode','levitique','nombres','deuteronome','josue','juges','ruth',
    'samuel','rois','chroniques','esdras','nehemie','esther','job',
    'psaume','psaumes','proverbes','ecclesiaste','cantique','cantique des cantiques',
    'esaie','isaie','jeremie','lamentations','ezechiel','daniel',
    'osee','joel','amos','abdias','jonas','michee','nahum','habacuc',
    'sophonie','aggee','zacharie','malachie',
    'matthieu','marc','luc','jean','actes',
    'romains','corinthiens','galates','ephesiens','philippiens','colossiens',
    'thessaloniciens','timothee','tite','philemon','hebreux',
    'jacques','pierre','jude','apocalypse'
  ].join('|');

  const PATTERN = new RegExp(
    '(?:(premier|deuxieme|troisieme|1er|2e|3e|1|2|3)\\s+)?' +
    '(' + LIVRES_REGEX + ')' +
    '\\s+(?:chapitre\\s+)?(\\d+)' +
    '(?:\\s*[:\\s,.]\\s*(?:verset\\s+|v\\s*)?(\\d+))?',
    'gi'
  );

  let recognition = null;
  let enEcoute = false;
  let dernierVerset = '';

  vue.innerHTML = `
    <h1>Versets en direct</h1>
    <p class="sous-titre">Detection automatique des versets cites par le pasteur.</p>

    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn-petit" id="btn-ecouter">Demarrer l'ecoute</button>
      <button class="btn-petit btn-secondaire" id="btn-plein-ecran">Plein ecran</button>
    </div>

    <div class="carte" id="zone-ecoute" style="display:none">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span id="indicateur-micro" style="width:12px;height:12px;border-radius:50%;background:#dc2626;animation:pulse 1.5s infinite"></span>
        <strong>Ecoute en cours...</strong>
      </div>
      <div id="transcription" style="color:var(--texte-doux);font-style:italic;min-height:40px;font-size:.9rem"></div>
    </div>

    <div id="zone-verset" style="margin-top:16px">
      <div class="carte" style="text-align:center;padding:40px 20px">
        <p class="message-vide">En attente d'un verset... Le pasteur cite un passage biblique et il s'affichera ici automatiquement.</p>
      </div>
    </div>

    <div id="historique-versets" style="margin-top:24px"></div>

    <style>
      @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
      .verset-affiche { background:linear-gradient(135deg,#0f766e 0%,#115e59 100%); color:#fff;
        border-radius:16px; padding:32px 24px; text-align:center; margin-bottom:16px; }
      .verset-affiche .ref { font-size:1.4rem; font-weight:800; margin-bottom:12px; color:#fbbf24; }
      .verset-affiche .texte { font-size:1.2rem; line-height:1.7; font-style:italic; }
      .verset-mini { border-left:4px solid var(--primaire); padding:8px 12px; margin-bottom:8px;
        background:var(--fond-carte); border-radius:0 8px 8px 0; }
      .verset-mini .ref { font-weight:700; color:var(--primaire); font-size:.9rem; }
      .verset-mini .texte { font-size:.85rem; color:var(--texte-doux); margin-top:4px; }
    </style>`;

  const historique = [];

  async function chercherVerset(livre, chapitre, verset) {
    const ref = verset ? livre + ' ' + chapitre + ':' + verset : livre + ' ' + chapitre;
    if (ref === dernierVerset) return;
    dernierVerset = ref;

    const zone = document.getElementById('zone-verset');
    zone.innerHTML = `<div class="verset-affiche">
      <div class="ref">${esc(ref)}</div>
      <div class="texte">Chargement...</div>
    </div>`;

    try {
      const url = '/api/bible/' + encodeURIComponent(livre) + '/' + chapitre + (verset ? '/' + verset : '');
      const r = await fetch(url).then((r) => r.json());
      const texte = r.texte || 'Texte non disponible.';
      const refAff = r.reference || ref;

      zone.innerHTML = `<div class="verset-affiche">
        <div class="ref">${esc(refAff)}</div>
        <div class="texte">${esc(texte)}</div>
      </div>`;

      historique.unshift({ ref: refAff, texte });
      if (historique.length > 20) historique.pop();
      afficherHistorique();

      fetch('/api/bible/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: refAff, texte })
      }).catch(() => {});
    } catch {
      zone.innerHTML = `<div class="verset-affiche">
        <div class="ref">${esc(ref)}</div>
        <div class="texte">Impossible de charger le texte.</div>
      </div>`;
    }
  }

  function afficherHistorique() {
    const el = document.getElementById('historique-versets');
    if (!el || historique.length < 2) return;
    el.innerHTML = '<h3 style="margin-bottom:8px">Versets precedents</h3>' +
      historique.slice(1).map((v) =>
        `<div class="verset-mini"><div class="ref">${esc(v.ref)}</div>
         <div class="texte">${esc(v.texte)}</div></div>`
      ).join('');
  }

  function analyserTexte(texte) {
    const t = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let match;
    PATTERN.lastIndex = 0;
    while ((match = PATTERN.exec(t)) !== null) {
      let prefixe = match[1] || '';
      if (prefixe === '1er') prefixe = '1';
      if (prefixe === '2e') prefixe = '2';
      if (prefixe === '3e') prefixe = '3';
      if (prefixe === 'premier') prefixe = '1';
      if (prefixe === 'deuxieme') prefixe = '2';
      if (prefixe === 'troisieme') prefixe = '3';

      let livre = match[2];
      if (prefixe) livre = prefixe + ' ' + livre;

      const chapitre = match[3];
      const verset = match[4] || null;
      chercherVerset(livre, chapitre, verset);
    }
  }

  function demarrerEcoute() {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      const el = document.getElementById('transcription');
      if (el) el.textContent = interim || final || '...';

      if (final) analyserTexte(final);
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      console.error('Speech error:', e.error);
    };

    recognition.onend = () => {
      if (enEcoute) recognition.start();
    };

    recognition.start();
    enEcoute = true;
    document.getElementById('zone-ecoute').style.display = '';
    document.getElementById('btn-ecouter').textContent = 'Arreter l\'ecoute';
    document.getElementById('btn-ecouter').classList.add('btn-danger');
  }

  function arreterEcoute() {
    enEcoute = false;
    if (recognition) { recognition.abort(); recognition = null; }
    document.getElementById('zone-ecoute').style.display = 'none';
    document.getElementById('btn-ecouter').textContent = 'Demarrer l\'ecoute';
    document.getElementById('btn-ecouter').classList.remove('btn-danger');
  }

  document.getElementById('btn-ecouter').onclick = () => {
    if (enEcoute) arreterEcoute(); else demarrerEcoute();
  };

  document.getElementById('btn-plein-ecran').onclick = () => {
    const el = document.getElementById('zone-verset');
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  };
}

/* ============ Parametres de l'eglise ============ */

async function vueParametres(vue) {
  const o = etat.org || {};
  const lbl1 = o.label_section1 || 'Tribus';
  const lbl2 = o.label_section2 || 'Departements';

  vue.innerHTML = `
    <h1>Parametres de l'eglise</h1>
    <p class="sous-titre">Personnalisez les noms de vos sections. Chaque eglise peut utiliser ses propres termes.</p>

    <div class="carte">
      <h2 style="margin-top:0">Noms des sections</h2>
      <p class="aide" style="margin-bottom:14px">Exemples : Tribus, Cellules, Zones, Groupes, Familles...</p>
      <form id="form-labels">
        <div class="ligne-champs">
          <div>
            <label>Section 1 (actuellement : ${esc(lbl1)})</label>
            <input name="label_section1" value="${esc(lbl1)}" required placeholder="ex. Tribus, Cellules, Zones">
          </div>
          <div>
            <label>Section 2 (actuellement : ${esc(lbl2)})</label>
            <input name="label_section2" value="${esc(lbl2)}" required placeholder="ex. Departements, Commissions, Ministeres">
          </div>
        </div>
        <button class="btn-bloc" type="submit">Enregistrer</button>
      </form>
    </div>

    <div class="carte">
      <h2 style="margin-top:0">Informations de l'eglise</h2>
      <div class="liste">
        <div class="element">
          <div class="infos">
            <div class="nom">${esc(o.nom)}</div>
            <div class="detail">Slug : <strong>${esc(o.slug)}</strong></div>
            <div class="detail">Plan : <strong>${esc(o.plan)}</strong> · Statut : <strong>${esc(o.statut)}</strong></div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('form-labels').onsubmit = async (e) => {
    e.preventDefault();
    const donnees = Object.fromEntries(new FormData(e.target));
    try {
      await api.put('/organisations/labels', donnees);
      etat.org.label_section1 = donnees.label_section1;
      etat.org.label_section2 = donnees.label_section2;
      toast('Noms des sections mis a jour !');
      await router();
    } catch (err) { toast(err.message, true); }
  };
}

/* ============ Banniere d'expiration ============ */

function banniereAbonnement() {
  const o = etat.org;
  if (!o) return '';

  if (o.plan === 'essai' && o.date_fin_essai) {
    const fin = new Date(o.date_fin_essai);
    const maintenant = new Date();
    const jours = Math.ceil((fin - maintenant) / (1000 * 60 * 60 * 24));
    if (jours <= 0) {
      return `<div class="encart-alerte" style="border-left:4px solid #dc2626">
        <strong>Votre essai gratuit est termine.</strong>
        Souscrivez un abonnement pour continuer a utiliser ZAURA.
        <a href="#/abonnement" style="margin-left:8px;font-weight:700">Voir les plans</a>
      </div>`;
    }
    if (jours <= 2) {
      return `<div class="encart-attention" style="border-left:4px solid #f59e0b">
        <strong>Il vous reste ${jours} jour(s) d'essai gratuit.</strong>
        <a href="#/abonnement" style="margin-left:8px;font-weight:700">S'abonner maintenant</a>
      </div>`;
    }
    return `<div class="encart-info">
      Essai gratuit : <strong>${jours} jour(s) restant(s)</strong> —
      <a href="#/abonnement">Voir les plans d'abonnement</a>
    </div>`;
  }

  if (o.abonnement && o.abonnement.date_fin) {
    const fin = new Date(o.abonnement.date_fin);
    const maintenant = new Date();
    const jours = Math.ceil((fin - maintenant) / (1000 * 60 * 60 * 24));
    if (jours <= 0) {
      return `<div class="encart-alerte" style="border-left:4px solid #dc2626">
        <strong>Votre abonnement a expire.</strong>
        <a href="#/abonnement" style="margin-left:8px;font-weight:700">Renouveler</a>
      </div>`;
    }
    if (jours <= 7) {
      return `<div class="encart-attention" style="border-left:4px solid #f59e0b">
        Votre abonnement expire dans <strong>${jours} jour(s)</strong>.
        <a href="#/abonnement" style="margin-left:8px;font-weight:700">Renouveler</a>
      </div>`;
    }
  }

  return '';
}

/* ============ Abonnement ============ */

async function vueAbonnement(vue) {
  const r = await api.get('/organisations/abonnement');
  const o = etat.org || {};
  const plans = r.plans || {};
  const jours = r.jours_restants;
  const estEssai = r.plan === 'essai';

  const NUMEROS = {
    wave: '+242 06 XXX XX XX',
    orange_money: '+242 06 XXX XX XX',
    mtn_money: '+242 06 XXX XX XX',
  };

  const nomMoyen = (m) => {
    if (m === 'wave') return 'Wave';
    if (m === 'orange_money') return 'Orange Money';
    if (m === 'mtn_money') return 'MTN Mobile Money';
    return m;
  };

  vue.innerHTML = `
    <h1>Abonnement</h1>
    <p class="sous-titre">Gerez votre abonnement et choisissez le plan adapte a votre eglise.</p>

    <div class="carte" style="border-left:4px solid ${estEssai ? 'var(--ambre)' : jours !== null && jours <= 7 ? '#dc2626' : 'var(--primaire)'}">
      <h2 style="margin-top:0">Statut actuel</h2>
      <div class="grille-stats" style="margin-bottom:0">
        ${tuile(estEssai ? 'Essai gratuit' : plans[r.plan] ? plans[r.plan].libelle : r.plan, 'Plan actuel', { ton: 'accent' })}
        ${tuile(jours !== null ? (jours <= 0 ? 'Expire' : jours + ' jour(s)') : '—', 'Jours restants', {
          ton: jours !== null && jours <= 1 ? 'alerte' : jours !== null && jours <= 2 ? '' : 'bien'
        })}
        ${tuile(r.statut === 'actif' ? 'Actif' : r.statut === 'essai' ? 'Essai' : r.statut === 'expire' ? 'Expire' : r.statut, 'Statut', {
          ton: r.statut === 'actif' || r.statut === 'essai' ? 'bien' : 'alerte'
        })}
      </div>
      ${estEssai && jours !== null && jours > 0 ? `<p class="aide" style="margin:12px 0 0">
        Votre essai gratuit se termine le <strong>${dateFr(o.date_fin_essai)}</strong>.
        Choisissez un plan ci-dessous pour continuer apres l'essai.</p>` : ''}
      ${jours !== null && jours <= 0 ? `<p style="color:#dc2626;font-weight:600;margin:12px 0 0">
        Votre abonnement a expire. Renouvelez pour retrouver l'acces complet.</p>` : ''}
    </div>

    <h2>Plans disponibles</h2>
    <div class="grille-cartes" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
      <div class="carte ${r.plan === 'essai' ? 'carte-selectionnee' : ''}" style="text-align:center;padding:24px">
        <div style="font-size:1.4rem;font-weight:800;color:var(--primaire)">Essai gratuit</div>
        <div style="font-size:2rem;font-weight:900;margin:12px 0">0 FCFA</div>
        <div class="aide">3 jours pour decouvrir ZAURA</div>
        <ul style="text-align:left;margin:16px 0;padding-left:20px;font-size:.9rem">
          <li>Toutes les fonctionnalites</li>
          <li>Jusqu'a 50 membres</li>
          <li>Support par email</li>
        </ul>
        ${r.plan === 'essai' ? '<div class="badge badge-teal" style="font-size:.85rem">Plan actuel</div>' : ''}
      </div>

      <div class="carte ${r.plan === 'mensuel' ? 'carte-selectionnee' : ''}" style="text-align:center;padding:24px;border:2px solid var(--primaire)">
        <div style="font-size:1.4rem;font-weight:800;color:var(--primaire)">Mensuel</div>
        <div style="font-size:2rem;font-weight:900;margin:12px 0">5 000 <span style="font-size:1rem">FCFA/mois</span></div>
        <div class="aide">Paiement flexible chaque mois</div>
        <ul style="text-align:left;margin:16px 0;padding-left:20px;font-size:.9rem">
          <li>Membres illimites</li>
          <li>Toutes les fonctionnalites</li>
          <li>Support prioritaire</li>
        </ul>
        ${r.plan === 'mensuel' ? '<div class="badge badge-teal" style="font-size:.85rem">Plan actuel</div>'
          : '<button class="btn-bloc btn-choisir-plan" data-plan="mensuel" data-prix="5000">Choisir ce plan</button>'}
      </div>

      <div class="carte ${r.plan === 'annuel' ? 'carte-selectionnee' : ''}" style="text-align:center;padding:24px;position:relative;border:2px solid var(--primaire)">
        <div style="position:absolute;top:-12px;right:16px;background:var(--gradient-vif);color:#fff;padding:4px 12px;border-radius:20px;font-size:.75rem;font-weight:700">2 mois offerts</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--primaire)">Annuel</div>
        <div style="font-size:2rem;font-weight:900;margin:12px 0">50 000 <span style="font-size:1rem">FCFA/an</span></div>
        <div class="aide">Economisez 10 000 FCFA par an</div>
        <ul style="text-align:left;margin:16px 0;padding-left:20px;font-size:.9rem">
          <li>Membres illimites</li>
          <li>Toutes les fonctionnalites</li>
          <li>Support prioritaire</li>
        </ul>
        ${r.plan === 'annuel' ? '<div class="badge badge-teal" style="font-size:.85rem">Plan actuel</div>'
          : '<button class="btn-bloc btn-choisir-plan" data-plan="annuel" data-prix="50000">Choisir ce plan</button>'}
      </div>
    </div>

    <div id="zone-paiement" style="display:none;margin-top:24px">
      <h2>Payer par mobile money</h2>
      <div class="carte">
        <p class="aide" style="margin-bottom:16px">Choisissez votre moyen de paiement et suivez les instructions.</p>

        <div id="info-plan-choisi" style="background:var(--primaire-pale);padding:12px 16px;border-radius:8px;margin-bottom:16px">
          <strong>Plan choisi :</strong> <span id="txt-plan">—</span> ·
          <strong>Montant :</strong> <span id="txt-prix">—</span> FCFA
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
          <button class="btn-moyen" data-moyen="wave"
            style="flex:1;min-width:120px;padding:16px;border:2px solid var(--bordure);border-radius:12px;background:var(--fond-carte);cursor:pointer;text-align:center;transition:all .2s">
            <div style="font-size:1.6rem">🌊</div>
            <div style="font-weight:700;margin-top:4px">Wave</div>
          </button>
          <button class="btn-moyen" data-moyen="orange_money"
            style="flex:1;min-width:120px;padding:16px;border:2px solid var(--bordure);border-radius:12px;background:var(--fond-carte);cursor:pointer;text-align:center;transition:all .2s">
            <div style="font-size:1.6rem">🟠</div>
            <div style="font-weight:700;margin-top:4px">Orange Money</div>
          </button>
          <button class="btn-moyen" data-moyen="mtn_money"
            style="flex:1;min-width:120px;padding:16px;border:2px solid var(--bordure);border-radius:12px;background:var(--fond-carte);cursor:pointer;text-align:center;transition:all .2s">
            <div style="font-size:1.6rem">🟡</div>
            <div style="font-weight:700;margin-top:4px">MTN Money</div>
          </button>
        </div>

        <div id="instructions-paiement" style="display:none">
          <div class="encart-info" style="border-left:4px solid var(--primaire)">
            <strong>Instructions :</strong>
            <ol style="margin:8px 0 0;padding-left:20px" id="etapes-paiement"></ol>
          </div>
          <div style="margin-top:16px">
            <label>Reference du paiement (numero de transaction)</label>
            <input id="ref-paiement" placeholder="ex. TXN123456789" style="margin-bottom:12px">
            <button class="btn-bloc" id="btn-confirmer-paiement">Confirmer le paiement</button>
          </div>
          <p class="aide" style="margin-top:8px">Apres confirmation, votre abonnement sera active sous 24h
            par l'administrateur ZAURA.</p>
        </div>
      </div>
    </div>

    ${r.historique && r.historique.length ? `
    <h2>Historique des paiements</h2>
    <div class="carte conteneur-table"><table>
      <thead><tr>
        <th>Plan</th><th>Montant</th><th>Moyen</th><th>Reference</th><th>Debut</th><th>Fin</th><th>Statut</th>
      </tr></thead>
      <tbody>${r.historique.map((a) => `<tr>
        <td>${esc(plans[a.plan] ? plans[a.plan].libelle : a.plan)}</td>
        <td class="numerique">${nombre(a.montant)} FCFA</td>
        <td>${esc(nomMoyen(a.moyen_paiement))}</td>
        <td>${esc(a.reference_paiement || '—')}</td>
        <td>${dateFr(a.date_debut)}</td>
        <td>${dateFr(a.date_fin)}</td>
        <td>${a.statut === 'actif' ? '<span class="badge badge-teal">Actif</span>' : esc(a.statut)}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : ''}

    <div class="encart-info" style="margin-top:24px">
      <strong>Besoin d'aide ?</strong> Contactez l'equipe ZAURA pour toute question sur votre abonnement.
    </div>`;

  let planChoisi = '';
  let prixChoisi = 0;
  let moyenChoisi = '';

  vue.querySelectorAll('.btn-choisir-plan').forEach((btn) => {
    btn.onclick = () => {
      planChoisi = btn.dataset.plan;
      prixChoisi = Number(btn.dataset.prix);
      document.getElementById('zone-paiement').style.display = '';
      document.getElementById('txt-plan').textContent = planChoisi === 'mensuel' ? 'Mensuel' : 'Annuel';
      document.getElementById('txt-prix').textContent = nombre(prixChoisi);
      document.getElementById('instructions-paiement').style.display = 'none';
      moyenChoisi = '';
      vue.querySelectorAll('.btn-moyen').forEach((b) => b.style.borderColor = 'var(--bordure)');
      document.getElementById('zone-paiement').scrollIntoView({ behavior: 'smooth' });
    };
  });

  vue.querySelectorAll('.btn-moyen').forEach((btn) => {
    btn.onclick = () => {
      moyenChoisi = btn.dataset.moyen;
      vue.querySelectorAll('.btn-moyen').forEach((b) => b.style.borderColor = 'var(--bordure)');
      btn.style.borderColor = 'var(--primaire)';

      const etapes = document.getElementById('etapes-paiement');
      const nom = nomMoyen(moyenChoisi);
      const numero = NUMEROS[moyenChoisi] || 'XX XXX XX XX';
      etapes.innerHTML = `
        <li>Ouvrez votre application <strong>${esc(nom)}</strong></li>
        <li>Envoyez <strong>${nombre(prixChoisi)} FCFA</strong> au numero <strong>${esc(numero)}</strong></li>
        <li>Dans le motif/reference, indiquez : <strong>ZAURA-${esc(o.slug || '').toUpperCase()}</strong></li>
        <li>Notez le numero de transaction et saisissez-le ci-dessous</li>`;
      document.getElementById('instructions-paiement').style.display = '';
    };
  });

  const btnConfirmer = document.getElementById('btn-confirmer-paiement');
  if (btnConfirmer) btnConfirmer.onclick = async () => {
    const ref = document.getElementById('ref-paiement').value.trim();
    if (!ref) return toast('Veuillez saisir la reference du paiement.', true);
    if (!moyenChoisi) return toast('Veuillez choisir un moyen de paiement.', true);
    if (!planChoisi) return toast('Veuillez choisir un plan.', true);

    btnConfirmer.disabled = true;
    try {
      await api.post('/organisations/paiement', {
        plan: planChoisi,
        montant: prixChoisi,
        moyen_paiement: moyenChoisi,
        reference_paiement: ref,
      });
      toast('Paiement enregistre ! Votre abonnement sera active sous 24h.');
      vueAbonnement(vue);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnConfirmer.disabled = false;
    }
  };
}
