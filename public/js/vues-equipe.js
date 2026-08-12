/**
 * vues-equipe.js — Vues des patriarches et des responsables de département.
 *   · Tableau de bord d'un encadrant (ses équipes)
 *   · Détail d'une tribu / d'un département
 *   · Liste des événements et FICHE DE PRÉSENCE (vert / rouge par fidèle)
 */

/* ============ Tableau de bord d'un encadrant ============ */

async function vueAccueilEncadrant(vue) {
  const p = etat.user.perimetre;
  const equipes = [
    ...p.tribus.map((t) => ({ ...t, genre: 'tribu', chemin: 'tribus' })),
    ...p.departements.map((d) => ({ ...d, genre: 'departement', chemin: 'departements' })),
  ];

  if (!equipes.length) {
    vue.innerHTML = `<h1>Bienvenue, ${esc(etat.user.prenom)}</h1>
      <div class="encart-info">Aucune tribu ni département ne vous est confié pour l'instant.
      Contactez le pasteur pour votre affectation.</div>`;
    return;
  }

  // Un seul périmètre : on affiche directement son tableau de bord.
  if (equipes.length === 1) {
    const seule = equipes[0];
    return seule.genre === 'tribu' ? vueTribu(vue, seule.id) : vueDepartement(vue, seule.id);
  }

  const stats = await Promise.all(equipes.map((e) =>
    api.get(`/stats/${e.genre}/${e.id}`).catch(() => null)));

  vue.innerHTML = `
    <h1>Mon tableau de bord</h1>
    <p class="sous-titre">${equipes.length} équipe(s) sous votre responsabilité.</p>
    <div class="grille-cartes">
      ${equipes.map((e, i) => {
        const s = stats[i];
        return `<a class="carte-equipe" href="#/${e.chemin}/${e.id}">
          <div class="titre">${esc(e.nom)}</div>
          <div class="meneur">${e.genre === 'tribu' ? 'Tribu' : 'Département'}</div>
          <div class="chiffres">
            <div><strong>${s ? nombre(s.nb_membres) : '—'}</strong> fidèle(s)</div>
            <div><strong>${s ? pourcent(s.taux_presence) : '—'}</strong> présence</div>
          </div>
        </a>`;
      }).join('')}
    </div>
    <div class="barre-actions" style="margin-top:16px">
      <a class="btn" href="#/presences">📋 Fiches de présence</a>
      <a class="btn btn-secondaire" href="#/fideles">Mes fidèles</a>
    </div>`;
}

/* ============ Détail d'une tribu ============ */

async function vueTribu(vue, id) {
  // Un fidèle simple consulte la composition de sa tribu ; un patriarche et le
  // corps pastoral disposent en plus des statistiques et des actions.
  const detail = await api.get('/tribus/' + id);
  if (!detail.geree) return vueTribuLecture(vue, detail);

  const s = await api.get('/stats/tribu/' + id);
  vue.innerHTML = `
    ${estDirection() ? '<a href="#/tribus" class="btn btn-petit btn-neutre retour">← Toutes les tribus</a>' : ''}
    <div class="entete-page">
      <div>
        <h1>Tribu ${esc(s.tribu.nom)}</h1>
        <p class="sous-titre">${s.tribu.patriarche_prenom
          ? 'Patriarche : <strong>' + esc(s.tribu.patriarche_prenom) + ' ' + esc(s.tribu.patriarche_nom) + '</strong>'
          : '<em>Patriarche à désigner</em>'} · ${nombre(s.nb_membres)} fidèle(s)</p>
      </div>
      <button id="btn-nouvelle-fiche">📋 Nouvelle fiche de présence</button>
    </div>

    ${blocAlertes(s.alertes_absences, 'tribu ' + s.tribu.nom)}

    <div class="grille-stats">
      ${tuile(nombre(s.nb_membres), 'Fidèles de la tribu', { ton: 'accent' })}
      ${tuile(pourcent(s.presence.taux), 'Assiduité générale', {
        ton: s.presence.taux !== null && s.presence.taux < 60 ? 'alerte' : 'bien',
        appoint: `${nombre(s.presence.total)} pointage(s), toutes activités`,
      })}
      ${tuile(pourcent(s.presence_activites.taux), 'Présence aux réunions de tribu', {
        appoint: `${nombre(s.presence_activites.total)} pointage(s)`,
      })}
      ${tuile(nombre(s.alertes_absences.length), 'Fidèles en alerte', { ton: s.alertes_absences.length ? 'alerte' : '' })}
    </div>
    <p class="aide" style="margin:-8px 0 16px">L'assiduité générale inclut les cultes d'assemblée ;
      la seconde mesure ne retient que les réunions propres à la tribu.</p>

    <div class="carte">
      <h3>Répartition des pointages</h3>
      ${s.presence.total ? repartitionPointages(s.presence)
        : '<p class="message-vide">Aucun pointage — créez une fiche de présence pour commencer.</p>'}
    </div>

    <h2>Évolution du taux de présence</h2>
    <div class="carte">${colonnesEvolution(s.evolution)}</div>

    <h2>Assiduité des fidèles</h2>
    <div class="carte conteneur-table"><table>
      <thead><tr><th>Fidèle</th><th>Rôle</th><th class="numerique">Présences</th>
        <th style="min-width:104px">Taux</th></tr></thead>
      <tbody>${s.membres.map((m) => `<tr>
        <td><a href="#/fideles/${m.id}"><strong>${esc(m.prenom)} ${esc(m.nom)}</strong></a></td>
        <td>${badgeRole(m.role)}</td>
        <td class="numerique">${nombre(m.presents)}/${nombre(m.total)}</td>
        <td>${jauge(m.taux_presence)}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="message-vide">Aucun fidèle rattaché à cette tribu.</td></tr>'}</tbody>
    </table></div>

    <h2>Dernières fiches de présence</h2>
    ${listeEvenementsCourte(s.evenements)}`;

  document.getElementById('btn-nouvelle-fiche').onclick =
    () => ouvrirCreationFiche({ portee: 'tribu', id, nom: s.tribu.nom });
}

/** Vue en lecture seule pour un fidèle qui consulte sa propre tribu. */
function vueTribuLecture(vue, detail) {
  const t = detail.tribu;
  vue.innerHTML = `
    <h1>Tribu ${esc(t.nom)}</h1>
    <p class="sous-titre">${t.patriarche_prenom
      ? 'Patriarche : <strong>' + esc(t.patriarche_prenom) + ' ' + esc(t.patriarche_nom) + '</strong>'
      : '<em>Patriarche à désigner</em>'} · ${nombre(t.nb_membres)} fidèle(s)</p>
    ${t.description ? `<div class="encart-info">${esc(t.description)}</div>` : ''}
    <h2>Les fidèles de la tribu</h2>
    <div class="liste">
      ${detail.membres.map((m) => `<div class="element">
        <div class="infos">
          <div class="nom">${esc(m.prenom)} ${esc(m.nom)} ${badgeRole(m.role)}</div>
          ${m.departements.length
            ? `<div class="detail">${m.departements.map((d) => esc(d.nom)).join(' · ')}</div>` : ''}
        </div>
      </div>`).join('') || '<p class="message-vide">Aucun fidèle rattaché.</p>'}
    </div>`;
}

/* ============ Détail d'un département ============ */

async function vueDepartement(vue, id) {
  const detail = await api.get('/departements/' + id);
  if (!detail.geree) return vueDepartementLecture(vue, detail);

  const [s, tous] = await Promise.all([
    api.get('/stats/departement/' + id),
    api.get('/users?statut=actif').then((r) => r.users).catch(() => []),
  ]);
  const membresIds = new Set(s.membres.map((m) => m.id));
  const candidats = tous.filter((u) => !membresIds.has(u.id));

  vue.innerHTML = `
    ${estDirection() ? '<a href="#/departements" class="btn btn-petit btn-neutre retour">← Tous les départements</a>' : ''}
    <div class="entete-page">
      <div>
        <h1>${esc(s.departement.nom)}</h1>
        <p class="sous-titre">${s.departement.responsable_prenom
          ? 'Responsable : <strong>' + esc(s.departement.responsable_prenom) + ' ' + esc(s.departement.responsable_nom) + '</strong>'
          : '<em>Responsable à désigner</em>'} · ${nombre(s.nb_membres)} membre(s)</p>
      </div>
      <button id="btn-nouvelle-fiche">📋 Nouvelle fiche de présence</button>
    </div>

    ${blocAlertes(s.alertes_absences, s.departement.nom)}

    <div class="grille-stats">
      ${tuile(nombre(s.nb_membres), 'Membres du département', { ton: 'accent' })}
      ${tuile(pourcent(s.presence.taux), 'Assiduité générale', {
        ton: s.presence.taux !== null && s.presence.taux < 60 ? 'alerte' : 'bien',
        appoint: `${nombre(s.presence.total)} pointage(s), toutes activités`,
      })}
      ${tuile(pourcent(s.presence_activites.taux), 'Présence aux activités du département', {
        appoint: `${nombre(s.presence_activites.total)} pointage(s)`,
      })}
      ${tuile(nombre(s.alertes_absences.length), 'Membres en alerte', { ton: s.alertes_absences.length ? 'alerte' : '' })}
    </div>
    <p class="aide" style="margin:-8px 0 16px">L'assiduité générale inclut les cultes d'assemblée ;
      la seconde mesure ne retient que les activités propres au département.</p>

    <div class="carte">
      <h3>Répartition des pointages</h3>
      ${s.presence.total ? repartitionPointages(s.presence)
        : '<p class="message-vide">Aucun pointage — créez une fiche de présence pour commencer.</p>'}
    </div>

    <h2>Évolution du taux de présence</h2>
    <div class="carte">${colonnesEvolution(s.evolution)}</div>

    <h2>Membres et assiduité</h2>
    <div class="carte conteneur-table"><table>
      <thead><tr><th>Membre</th><th>Tribu</th><th class="numerique">Présences</th>
        <th style="min-width:104px">Taux</th><th></th></tr></thead>
      <tbody>${s.membres.map((m) => `<tr data-id="${m.id}">
        <td><a href="#/fideles/${m.id}"><strong>${esc(m.prenom)} ${esc(m.nom)}</strong></a></td>
        <td>${m.tribu_nom ? esc(m.tribu_nom) : '—'}</td>
        <td class="numerique">${nombre(m.presents)}/${nombre(m.total)}</td>
        <td>${jauge(m.taux_presence)}</td>
        <td><button class="btn-petit btn-danger btn-retirer" title="Retirer du département">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="message-vide">Aucun membre dans ce département.</td></tr>'}</tbody>
    </table></div>

    <h2>Ajouter un membre</h2>
    <div class="carte barre-actions">
      <select id="sel-ajout" style="flex:1 1 220px">
        <option value="">— Choisir un fidèle —</option>
        ${candidats.map((u) => `<option value="${u.id}">${esc(u.prenom)} ${esc(u.nom)}${u.tribu_nom ? ' (' + esc(u.tribu_nom) + ')' : ''}</option>`).join('')}
      </select>
      <button id="btn-ajouter-membre">Ajouter</button>
    </div>

    <h2>Dernières fiches de présence</h2>
    ${listeEvenementsCourte(s.evenements)}`;

  document.getElementById('btn-nouvelle-fiche').onclick =
    () => ouvrirCreationFiche({ portee: 'departement', id, nom: s.departement.nom });

  document.getElementById('btn-ajouter-membre').onclick = async () => {
    const membreId = document.getElementById('sel-ajout').value;
    if (!membreId) return toast('Choisissez un fidèle.', true);
    try {
      await api.post(`/departements/${id}/membres`, { membre_id: Number(membreId) });
      toast('Membre ajouté au département.');
      vueDepartement(vue, id);
    } catch (err) { toast(err.message, true); }
  };

  vue.querySelectorAll('.btn-retirer').forEach((b) => {
    b.onclick = async () => {
      const membreId = b.closest('tr').dataset.id;
      if (!confirm('Retirer ce membre du département ?')) return;
      try {
        await api.del(`/departements/${id}/membres/${membreId}`);
        toast('Membre retiré.');
        vueDepartement(vue, id);
      } catch (err) { toast(err.message, true); }
    };
  });
}

function vueDepartementLecture(vue, detail) {
  const d = detail.departement;
  vue.innerHTML = `
    <h1>${esc(d.nom)}</h1>
    <p class="sous-titre">${d.responsable_prenom
      ? 'Responsable : <strong>' + esc(d.responsable_prenom) + ' ' + esc(d.responsable_nom) + '</strong>'
      : '<em>Responsable à désigner</em>'} · ${nombre(d.nb_membres)} membre(s)</p>
    ${d.description ? `<div class="encart-info">${esc(d.description)}</div>` : ''}
    <h2>Les membres</h2>
    <div class="liste">
      ${detail.membres.map((m) => `<div class="element">
        <div class="infos"><div class="nom">${esc(m.prenom)} ${esc(m.nom)} ${badgeRole(m.role)}</div>
        ${m.tribu_nom ? `<div class="detail">Tribu ${esc(m.tribu_nom)}</div>` : ''}</div>
      </div>`).join('') || '<p class="message-vide">Aucun membre.</p>'}
    </div>`;
}

/** Liste compacte d'événements réutilisée dans les tableaux de bord d'équipe. */
function listeEvenementsCourte(evenements) {
  if (!evenements || !evenements.length) {
    return '<p class="message-vide">Aucune fiche de présence pour le moment.</p>';
  }
  return `<div class="liste">${evenements.map((ev) => `<div class="element">
    <div class="infos">
      <div class="nom">${esc(ev.titre)}
        <span class="badge badge-teal">${esc(etat.ref.types_evenement[ev.type] || ev.type)}</span></div>
      <div class="detail">${dateFr(ev.date)} · ${nombre(ev.nb_presents)} présent(s) sur ${nombre(ev.nb_pointes)} pointé(s)</div>
    </div>
    <a class="btn btn-petit btn-secondaire" href="#/presences/${ev.id}">Ouvrir la fiche</a>
  </div>`).join('')}</div>`;
}

/* ============ Liste des événements / fiches de présence ============ */

async function vuePresences(vue) {
  const [r, tribus, departements] = await Promise.all([
    api.get('/evenements'), chargerTribus(), chargerDepartements(),
  ]);
  const direction = estDirection();
  const p = etat.user.perimetre;

  // Portées ouvertes à cet utilisateur.
  const porteesPossibles = [];
  if (direction) porteesPossibles.push(['assemblee', "Toute l'assemblée"]);
  if (direction || p.tribus.length) porteesPossibles.push(['tribu', 'Une tribu']);
  if (direction || p.departements.length) porteesPossibles.push(['departement', 'Un département']);

  const mesTribus = direction ? tribus : tribus.filter((t) => p.tribus.some((x) => x.id === t.id));
  const mesDepts = direction ? departements : departements.filter((d) => p.departements.some((x) => x.id === d.id));

  vue.innerHTML = `
    <h1>Fiches de présence</h1>
    <p class="sous-titre">Créez une fiche, puis pointez chaque fidèle : présent, absent ou excusé.</p>

    <div class="carte">
      <h3>Nouvelle fiche de présence</h3>
      <form id="form-ev">
        <div class="ligne-champs-3">
          <div><label>Type *</label><select name="type">
            ${Object.entries(etat.ref.types_evenement).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
          </select></div>
          <div><label>Date *</label><input type="date" name="date" required value="${aujourdhui()}"></div>
          <div><label>Concerne *</label><select name="portee" id="sel-portee">
            ${porteesPossibles.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
          </select></div>
        </div>
        <div id="zone-cible"></div>
        <label>Titre *</label>
        <input name="titre" required placeholder="ex. Culte du dimanche, Réunion de tribu…">
        <button class="btn-bloc" type="submit">Créer la fiche et pointer</button>
      </form>
    </div>

    <h2>Fiches existantes</h2>
    <div class="liste">
      ${r.evenements.map((ev) => {
        const reste = Math.max(ev.nb_concernes - ev.nb_pointes, 0);
        return `<div class="element" data-id="${ev.id}">
          <div class="infos">
            <div class="nom">${esc(ev.titre)}
              <span class="badge badge-teal">${esc(etat.ref.types_evenement[ev.type] || ev.type)}</span>
              ${etiquettePortee(ev)}</div>
            <div class="detail">${dateFr(ev.date)} ·
              ${ev.nb_pointes
                ? `<strong>${nombre(ev.nb_presents)}</strong> présent(s) sur ${nombre(ev.nb_pointes)} pointé(s)`
                : 'aucun pointage'}
              ${reste ? ` · <span style="color:var(--ambre)">${nombre(reste)} fidèle(s) à pointer</span>` : ' · ✓ fiche complète'}
            </div>
          </div>
          <div class="actions">
            <a class="btn btn-petit btn-secondaire" href="#/presences/${ev.id}">Pointer</a>
            <button class="btn-petit btn-danger btn-suppr" title="Supprimer">✕</button>
          </div>
        </div>`;
      }).join('') || '<p class="message-vide">Aucune fiche — créez la première ci-dessus.</p>'}
    </div>`;

  // Le sélecteur de cible s'adapte à la portée choisie.
  const zoneCible = document.getElementById('zone-cible');
  const selPortee = document.getElementById('sel-portee');
  function majCible() {
    const portee = selPortee.value;
    if (portee === 'tribu') {
      zoneCible.innerHTML = `<label>Tribu *</label>
        <select name="tribu_id">${options(mesTribus, null, '— Choisir —')}</select>`;
    } else if (portee === 'departement') {
      zoneCible.innerHTML = `<label>Département *</label>
        <select name="departement_id">${options(mesDepts, null, '— Choisir —')}</select>`;
    } else {
      zoneCible.innerHTML = `<p class="aide">Tous les fidèles actifs figureront sur la fiche.
        Chaque patriarche pointera les fidèles de sa tribu, chaque responsable ceux de son département.</p>`;
    }
  }
  selPortee.onchange = majCible;
  majCible();

  document.getElementById('form-ev').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r2 = await api.post('/evenements', Object.fromEntries(new FormData(e.target)));
      toast('Fiche créée — pointez les fidèles.');
      location.hash = '#/presences/' + r2.id;
    } catch (err) { toast(err.message, true); }
  };

  vue.querySelectorAll('.btn-suppr').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Supprimer cette fiche et tous ses pointages ?')) return;
      try {
        await api.del('/evenements/' + b.closest('.element').dataset.id);
        toast('Fiche supprimée.');
        vuePresences(vue);
      } catch (err) { toast(err.message, true); }
    };
  });
}

function etiquettePortee(ev) {
  if (ev.portee === 'tribu') return `<span class="badge badge-or">Tribu ${esc(ev.tribu_nom || '')}</span>`;
  if (ev.portee === 'departement') return `<span class="badge badge-or">${esc(ev.departement_nom || '')}</span>`;
  return '<span class="badge badge-gris">Assemblée</span>';
}

/** Création rapide d'une fiche depuis un tableau de bord d'équipe. */
async function ouvrirCreationFiche({ portee, id, nom }) {
  const titre = prompt(`Intitulé de la fiche de présence pour ${nom} :`,
    portee === 'tribu' ? 'Réunion de tribu' : 'Réunion de département');
  if (!titre) return;
  try {
    const corps = { type: 'reunion', titre, date: aujourdhui(), portee };
    if (portee === 'tribu') corps.tribu_id = id; else corps.departement_id = id;
    const r = await api.post('/evenements', corps);
    location.hash = '#/presences/' + r.id;
  } catch (err) { toast(err.message, true); }
}

/* ============ LA fiche de présence ============ */

async function vueFichePresence(vue, evenementId) {
  const r = await api.get(`/evenements/${evenementId}/presences`);
  const ev = r.evenement;

  // Statuts en cours de saisie, pré-remplis avec ce qui est déjà enregistré.
  const saisie = new Map(r.feuille.map((l) => [l.membre_id, l.statut || null]));
  let recherche = '';

  // Sur une fiche d'assemblée, on regroupe visuellement par tribu.
  const grouper = ev.portee === 'assemblee' &&
    new Set(r.feuille.map((l) => l.tribu_nom || '')).size > 1;

  vue.innerHTML = `
    <a href="#/presences" class="btn btn-petit btn-neutre retour">← Retour aux fiches</a>
    <div class="fiche-entete">
      <div class="nom" style="font-weight:800;font-size:1.1rem">${esc(ev.titre)}</div>
      <div class="detail" style="font-size:.84rem;color:var(--texte-doux)">
        ${esc(etat.ref.types_evenement[ev.type] || ev.type)} · ${dateFr(ev.date)} ·
        ${ev.portee === 'tribu' ? 'Tribu ' + esc(ev.tribu_nom || '')
          : ev.portee === 'departement' ? esc(ev.departement_nom || '')
          : "Toute l'assemblée"}
      </div>
      <div class="fiche-compteurs" id="compteurs"></div>
    </div>

    ${r.feuille.length > 8 ? `<div class="carte" style="padding:10px 12px">
      <input id="recherche" placeholder="🔍 Rechercher un fidèle…" style="margin:0">
    </div>` : ''}

    ${r.feuille.length ? `<div class="barre-actions" style="margin-bottom:12px">
      <button class="btn-petit btn-vert" id="btn-tous-presents">✓ Tout présent</button>
      <button class="btn-petit btn-neutre" id="btn-reinitialiser">Effacer la saisie</button>
    </div>` : ''}

    <div class="liste" id="feuille"></div>

    ${r.feuille.length ? `<div class="barre-enregistrement">
      <span class="resume" id="resume"></span>
      <button class="btn-vert" id="btn-enregistrer">💾 Enregistrer</button>
    </div>` : ''}`;

  const zoneFeuille = document.getElementById('feuille');
  const zoneCompteurs = document.getElementById('compteurs');
  const zoneResume = document.getElementById('resume');

  /** Redessine la liste des fidèles selon la recherche en cours. */
  function dessiner() {
    const motif = recherche.trim().toLowerCase();
    const visibles = r.feuille.filter((l) =>
      !motif || `${l.prenom} ${l.nom}`.toLowerCase().includes(motif));

    if (!visibles.length) {
      zoneFeuille.innerHTML = `<p class="message-vide">${r.feuille.length
        ? 'Aucun fidèle ne correspond à cette recherche.'
        : 'Aucun fidèle concerné par cette fiche dans votre périmètre.'}</p>`;
      return;
    }

    let html = '';
    let tribuCourante = null;
    for (const l of visibles) {
      if (grouper && l.tribu_nom !== tribuCourante) {
        tribuCourante = l.tribu_nom;
        html += `<div class="groupe-tribu">${esc(tribuCourante || 'Sans tribu')}</div>`;
      }
      const statut = saisie.get(l.membre_id);
      html += `<div class="element ${statut ? 'pointe-' + statut : ''}" data-id="${l.membre_id}">
        <div class="infos">
          <div class="nom">${esc(l.prenom)} ${esc(l.nom)}</div>
          ${!grouper && l.tribu_nom ? `<div class="detail">Tribu ${esc(l.tribu_nom)}</div>` : ''}
        </div>
        <div class="segments">
          ${['present', 'absent', 'excuse'].map((s) => `<button type="button" data-statut="${s}"
            class="${statut === s ? 'sel-' + s : ''}">${ICONES_PRESENCE[s]} ${esc(etat.ref.statuts_presence[s])}</button>`).join('')}
        </div>
      </div>`;
    }
    zoneFeuille.innerHTML = html;

    // Sélection tactile : un bouton par statut, exclusif pour chaque fidèle.
    zoneFeuille.querySelectorAll('.element').forEach((el) => {
      const membreId = Number(el.dataset.id);
      el.querySelectorAll('.segments button').forEach((b) => {
        b.onclick = () => {
          const statut = b.dataset.statut;
          // Un second appui sur le même statut annule le pointage.
          const nouveau = saisie.get(membreId) === statut ? null : statut;
          saisie.set(membreId, nouveau);
          el.className = 'element' + (nouveau ? ' pointe-' + nouveau : '');
          el.querySelectorAll('.segments button').forEach((x) => { x.className = ''; });
          if (nouveau) b.className = 'sel-' + nouveau;
          majCompteurs();
        };
      });
    });
  }

  /** Compteurs en haut et résumé de la barre d'enregistrement. */
  function majCompteurs() {
    const valeurs = [...saisie.values()];
    const n = (s) => valeurs.filter((v) => v === s).length;
    const pointes = valeurs.filter(Boolean).length;
    const restants = r.feuille.length - pointes;

    zoneCompteurs.innerHTML = `
      <span class="compteur c-present"><strong>${n('present')}</strong> présents</span>
      <span class="compteur c-absent"><strong>${n('absent')}</strong> absents</span>
      <span class="compteur c-excuse"><strong>${n('excuse')}</strong> excusés</span>
      <span class="compteur"><strong>${restants}</strong> à pointer</span>`;
    if (zoneResume) {
      zoneResume.textContent = restants
        ? `${pointes}/${r.feuille.length} fidèle(s) pointé(s) — ${restants} restant(s).`
        : `Fiche complète : ${r.feuille.length} fidèle(s) pointé(s).`;
    }
  }

  const champRecherche = document.getElementById('recherche');
  if (champRecherche) {
    champRecherche.oninput = (e) => { recherche = e.target.value; dessiner(); };
  }

  const btnTous = document.getElementById('btn-tous-presents');
  if (btnTous) btnTous.onclick = () => {
    r.feuille.forEach((l) => { if (!saisie.get(l.membre_id)) saisie.set(l.membre_id, 'present'); });
    dessiner(); majCompteurs();
    toast('Tous les fidèles non pointés sont marqués présents.');
  };

  const btnRaz = document.getElementById('btn-reinitialiser');
  if (btnRaz) btnRaz.onclick = () => {
    if (!confirm('Effacer la saisie en cours ? (les pointages déjà enregistrés restent en base tant que vous n\'enregistrez pas)')) return;
    saisie.forEach((_, k) => saisie.set(k, null));
    dessiner(); majCompteurs();
  };

  const btnEnregistrer = document.getElementById('btn-enregistrer');
  if (btnEnregistrer) btnEnregistrer.onclick = async () => {
    const presences = [...saisie.entries()]
      .filter(([, statut]) => statut)
      .map(([membre_id, statut]) => ({ membre_id, statut }));
    if (!presences.length) return toast('Pointez au moins un fidèle.', true);
    btnEnregistrer.disabled = true;
    try {
      const res = await api.put(`/evenements/${evenementId}/presences`, { presences });
      toast(`Fiche enregistrée : ${res.enregistres} fidèle(s).`);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnEnregistrer.disabled = false;
    }
  };

  dessiner();
  majCompteurs();
}
