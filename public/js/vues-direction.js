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

  vue.innerHTML = `
    <h1>Tableau de bord de l'assemblée</h1>
    <p class="sous-titre">Vue d'ensemble : ${nombre(e.fideles_actifs)} fidèle(s) actif(s),
      ${nombre(e.tribus)} tribu(s), ${nombre(e.departements)} département(s).</p>

    ${e.comptes_en_attente ? `<div class="encart-attention">⏳ <strong>${e.comptes_en_attente}</strong>
      compte(s) en attente de validation — <a href="#/validations">valider maintenant</a></div>` : ''}
    ${e.sans_tribu ? `<div class="encart-info">👥 <strong>${e.sans_tribu}</strong> fidèle(s) actif(s)
      ne sont rattachés à aucune tribu — <a href="#/fideles">les rattacher</a></div>` : ''}
    ${blocAlertes(s.alertes_absences)}

    <div class="grille-stats">
      ${tuile(nombre(e.fideles_actifs), 'Fidèles actifs', { ton: 'accent' })}
      ${tuile(pourcent(s.taux_presence_global), 'Taux de présence global', {
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

    <h2>Les tribus</h2>
    ${tableauEquipes(s.par_tribu, 'tribus', 'Patriarche', 'patriarche')}

    <h2>Les départements</h2>
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
      const meneur = l[prefixe + '_prenom']
        ? `${esc(l[prefixe + '_prenom'])} ${esc(l[prefixe + '_nom'])}`
        : '<em style="color:var(--ambre)">à désigner</em>';
      return `<tr>
        <td><a href="#/${chemin}/${l.id}"><strong>${esc(l.nom)}</strong></a></td>
        <td>${meneur}</td>
        <td class="numerique">${nombre(l.nb_membres)}</td>
        <td>${jauge(l.taux_presence)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* ============ Statistiques détaillées ============ */

async function vueStatistiques(vue) {
  const s = await api.get('/stats/global');
  const e = s.effectifs;

  vue.innerHTML = `
    <h1>Statistiques</h1>
    <p class="sous-titre">Assiduité, effectifs, rôles, tribus et départements.</p>

    <div class="grille-stats">
      ${tuile(nombre(e.fideles_actifs), 'Fidèles actifs', { ton: 'accent' })}
      ${tuile(nombre(e.pointages), 'Pointages cumulés')}
      ${tuile(pourcent(s.taux_presence_global), 'Présence globale', { ton: 'bien' })}
      ${tuile(nombre(s.alertes_absences.length), 'Fidèles en alerte', { ton: s.alertes_absences.length ? 'alerte' : '' })}
    </div>

    <h2>Effectif par tribu</h2>
    <div class="carte">${barres(s.par_tribu.map((t) => ({ etiquette: t.nom, valeur: t.nb_membres })))}</div>

    <h2>Taux de présence par tribu</h2>
    <div class="carte conteneur-table"><table>
      <thead><tr><th>Tribu</th><th class="numerique">Fidèles</th><th class="numerique">Pointages</th>
        <th style="min-width:104px">Présence</th></tr></thead>
      <tbody>${s.par_tribu.map((t) => `<tr>
        <td><a href="#/tribus/${t.id}"><strong>${esc(t.nom)}</strong></a></td>
        <td class="numerique">${nombre(t.nb_membres)}</td>
        <td class="numerique">${nombre(t.total)}</td>
        <td>${jauge(t.taux_presence)}</td>
      </tr>`).join('')}</tbody>
    </table></div>

    <h2>Effectif par département</h2>
    <div class="carte">${barres(s.par_departement.map((d) => ({ etiquette: d.nom, valeur: d.nb_membres })))}</div>

    <h2>Taux de présence par département</h2>
    <div class="carte conteneur-table"><table>
      <thead><tr><th>Département</th><th class="numerique">Membres</th><th class="numerique">Pointages</th>
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
      <div>
        <h1>${esc(m.prenom)} ${esc(m.nom)}</h1>
        <p class="sous-titre">${badgeRole(m.role)}
          ${m.tribu_nom ? ' · Tribu <strong>' + esc(m.tribu_nom) + '</strong>' : ' · sans tribu'}</p>
      </div>
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
}

/* ============ Administration des tribus ============ */

async function vueTribus(vue) {
  const [tribus, membres] = await Promise.all([
    chargerTribus(), api.get('/users?statut=actif').then((r) => r.users),
  ]);

  vue.innerHTML = `
    <h1>Les tribus</h1>
    <p class="sous-titre">Chaque tribu est conduite par un patriarche, qui pointe la présence de ses fidèles.</p>

    <div class="grille-cartes">
      ${tribus.map((t) => `<a class="carte-equipe ${t.patriarche_id ? '' : 'sans-responsable'}" href="#/tribus/${t.id}">
        <div class="titre">${esc(t.nom)}</div>
        <div class="meneur">${t.patriarche_id
          ? 'Patriarche : ' + esc(t.patriarche_prenom) + ' ' + esc(t.patriarche_nom)
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

    <h2>Ajouter une tribu</h2>
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

/* ============ Administration des départements ============ */

async function vueDepartements(vue) {
  const [departements, membres] = await Promise.all([
    chargerDepartements(), api.get('/users?statut=actif').then((r) => r.users),
  ]);

  vue.innerHTML = `
    <h1>Les départements</h1>
    <p class="sous-titre">Chaque département est conduit par un responsable, qui pointe la présence de ses membres.</p>

    <div class="grille-cartes">
      ${departements.map((d) => `<a class="carte-equipe ${d.responsable_id ? '' : 'sans-responsable'}" href="#/departements/${d.id}">
        <div class="titre">${esc(d.nom)}</div>
        <div class="meneur">${d.responsable_id
          ? 'Responsable : ' + esc(d.responsable_prenom) + ' ' + esc(d.responsable_nom)
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

    <h2>Ajouter un département</h2>
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
