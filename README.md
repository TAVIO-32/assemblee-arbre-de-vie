# Assemblée Arbre de Vie — Suivi des fidèles

Application web complète, responsive (mobile d'abord) et sécurisée pour le suivi
d'une assemblée organisée en **tribus** et en **départements** : fiches de
présence, hiérarchie pastorale, statistiques, cotisations, sujets de prière et
annonces WhatsApp. Interface 100 % en français.

## L'organisation de l'assemblée

**6 tribus** — SIMGAD · LEVASE · RUDAN · JUNEPH · JOZABU · BENISSII
Chaque fidèle appartient à **une** tribu, conduite par un **patriarche**.

**13 départements** — COM · MRES · ADN · EVANGELISATION · SAINTE SCENE ·
GROUPE DE LOUANGE · ECODIM · PORTIER · GESTION DE CULTE · PROTOCOLE ·
MEDECINE D'HONNEUR · SOCIAL · INTERCESSION
Un fidèle peut servir dans **plusieurs** départements, chacun conduit par un
**responsable de département**.

Tribus et départements sont créés automatiquement au premier démarrage, puis
modifiables (renommage, ajout, suppression) par le corps pastoral.

## Hiérarchie pastorale

| Rang | Rôle | Périmètre |
|---|---|---|
| 1 | **Pasteur Principal** | Toute l'assemblée — autorité maximale |
| 2 | **Pasteur Assistant** | Toute l'assemblée |
| 3 | **Assistant Pasteur** | Toute l'assemblée |
| 4 | **Patriarche** | Sa (ses) tribu(s) |
| 5 | **Responsable de département** | Son (ses) département(s) |
| 6 | **Fidèle** | Lui-même |

Règle appliquée côté serveur : **on ne peut jamais attribuer ni modifier un rôle
de niveau supérieur ou égal au sien** — seul le Pasteur Principal y échappe.
L'assemblée conserve toujours au moins un Pasteur Principal.

## Mise en ligne gratuite en un clic (Render)

[![Déployer sur Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Déposez ce dossier dans un dépôt GitHub (voir « Mettre le code sur GitHub » ci-dessous).
2. Sur [render.com](https://render.com), choisissez **New → Blueprint** et sélectionnez ce dépôt.
3. Render lit le fichier `render.yaml` et crée automatiquement le site **et** sa
   base PostgreSQL gratuite, avec un secret de session généré.
4. Au bout de quelques minutes vous obtenez un lien public à partager.

> Cette application est **totalement indépendante** de toute autre : son service
> Render s'appelle `arbre-de-vie` et sa base `arbre-de-vie-db`. Elle ne partage
> aucune donnée avec une autre application.

> ℹ️ Offre gratuite Render : le site se met en veille après 15 min d'inactivité
> (la première visite suivante prend ~30 s) et la base PostgreSQL gratuite est
> valable 30 jours puis doit être recréée ou remplacée par une base gratuite
> [Neon](https://neon.tech) (il suffit de changer la variable `DATABASE_URL`).

## Mettre le code sur GitHub

```bash
# 1. Créez un dépôt vide sur github.com (bouton « New repository »), sans README.
# 2. Depuis ce dossier :
git init
git add -A
git commit -m "Application Assemblée Arbre de Vie"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/assemblee-arbre-de-vie.git
git push -u origin main
```

## Démarrage local

```bash
npm install
npm start          # http://localhost:3000  (variable PORT pour changer)
```

> **Premier compte = administrateur** : le tout premier compte inscrit devient
> automatiquement le **Pasteur Principal** (actif immédiatement). Tous les
> comptes suivants restent « en attente » jusqu'à validation par un pasteur.

Variables d'environnement :

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute (défaut : 3000) |
| `DATABASE_URL` | Connexion PostgreSQL (production). Absente = SQLite local |
| `JWT_SECRET` | Secret de signature des sessions (**obligatoire en production**) |
| `NODE_ENV=production` | Active le cookie `Secure` (HTTPS) |
| `WHATSAPP_PROVIDER` | `lien` (défaut, wa.me) ou `api` (v2, à implémenter) |

## Les fiches de présence

Une fiche de présence est un **événement** (culte, réunion, prière, veillée,
répétition, formation, évangélisation, activité) dont la **portée** détermine
qui figure dessus :

| Portée | Fidèles listés | Qui peut la créer |
|---|---|---|
| **Assemblée** | tous les fidèles actifs | corps pastoral |
| **Tribu** | les fidèles de la tribu | son patriarche, corps pastoral |
| **Département** | les membres du département | son responsable, corps pastoral |

La fiche est ensuite **restreinte au périmètre de celui qui l'ouvre**. Lors d'un
culte d'assemblée, chaque patriarche ne voit et ne pointe que les fidèles de sa
tribu, chaque responsable que ceux de son département — le corps pastoral voit
l'ensemble, regroupé par tribu.

Le pointage se fait d'un geste : **✓ Présent (vert)**, **✕ Absent (rouge)**,
**~ Excusé (ambre)**. Un second appui sur le même statut annule la saisie.
Compteurs en direct, bouton « tout présent », recherche au-delà de 8 fidèles,
et barre d'enregistrement collante en bas d'écran.

## Statistiques

- **Tableau de bord de l'assemblée** — effectifs, taux de présence global,
  répartition présents / absents / excusés, évolution mensuelle, effectif par
  échelon hiérarchique, tableau des 6 tribus et des 13 départements.
- **Page Statistiques** — effectif et taux par tribu, par département et par
  rôle, palmarès d'assiduité individuelle.
- **Tableau de bord d'une tribu / d'un département** — deux mesures distinctes :
  l'**assiduité générale** de ses membres (tous pointages, cultes compris) et la
  **présence à ses propres activités**.
- **Espace du fidèle** — son taux, son historique, son évolution mensuelle.
- 🚨 **Alerte automatique** sur tout fidèle absent 3 fois de suite.

> Les couleurs de pointage (vert / rouge / ambre) sont validées pour la vision
> des couleurs et ne sont **jamais employées seules** : chaque état porte aussi
> une icône et un libellé écrit.

## Architecture technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Backend | Node.js + Express | API REST simple, très répandu, facile à faire évoluer |
| Base de données | **PostgreSQL** en production (`DATABASE_URL`), SQLite en local | Persistance gratuite et durable chez l'hébergeur ; zéro config en local |
| Authentification | `bcryptjs` (hachage) + JWT en cookie `httpOnly` | Mots de passe jamais stockés en clair ; session protégée du XSS |
| Frontend | SPA JavaScript vanilla + CSS mobile-first | Léger et rapide sur mobile, aucun outil de build nécessaire |
| WhatsApp | Service isolé `server/services/whatsapp.js` | v1 : liens `wa.me` pré-remplis ; v2 : brancher Twilio / Meta Cloud API sans toucher au reste |

### Structure du projet

```
server/
  index.js              Point d'entrée Express (API + fichiers statiques)
  constants.js          Référentiel métier : rôles, hiérarchie, tribus, départements
  db.js                 Schéma, double moteur PG/SQLite, migration, amorçage
  middleware/auth.js    Session, hiérarchie, périmètres (tribu / département)
  services/
    membres.js          Requêtes partagées sur la fiche d'un fidèle
    whatsapp.js         Abstraction d'envoi WhatsApp (v1 liens, v2 API)
  routes/               Une route = un domaine métier, contrôle d'accès inclus
    referentiel.js auth.js users.js tribus.js departements.js
    evenements.js cotisations.js demandes.js annonces.js stats.js
public/
  index.html
  css/styles.css
  js/api.js             Client HTTP
  js/core.js            État, composants d'affichage, coquille, authentification
  js/vues-direction.js  Corps pastoral : bord, stats, validations, tribus, départements
  js/vues-equipe.js     Patriarches et responsables : équipes et fiches de présence
  js/vues-membre.js     Espace du fidèle, profil, cotisations, demandes, annonces
  js/app.js             Routeur
```

### Schéma de base de données

- **tribus** — 6 tribus, `patriarche_id` désigne le conducteur
- **departements** — 13 départements, `responsable_id` désigne le conducteur
- **users** — comptes (rôle sur 6 niveaux, statut `en_attente`/`actif`/`rejete`,
  `tribu_id`, contact, WhatsApp…)
- **membres_departements** — liaison N-N : un fidèle sert dans plusieurs départements
- **evenements** — type, date, **portée** (`assemblee`/`tribu`/`departement`) et cible
- **presences** — une ligne par fidèle et par événement (`present`/`absent`/`excuse`)
- **cotisations** — montant, date, libellé, statut payé / non payé
- **demandes** — sujets de prière, préoccupations, besoins (confidentiels)
- **annonces** — historique des annonces envoyées (auteur, cible, canal)

Les listes de valeurs (rôles, types d'événements, portées) sont validées par
l'application depuis `server/constants.js` plutôt que figées par des contraintes
`CHECK`, afin qu'ajouter un rôle ou un type ne demande aucune migration.

### Migration depuis l'ancien modèle

Le démarrage exécute `db.migrer()`, **idempotente**, qui met à niveau une base
existante sans perte de données : ajout des colonnes manquantes, reprise des
affectations « un seul département » vers la table de liaison, correspondance
des anciens rôles (`membre` → Fidèle, `leader` → Responsable de département,
`pasteur` → Pasteur Assistant, le plus ancien étant promu Pasteur Principal),
retrait des contraintes `CHECK` obsolètes, puis amorçage des tribus et
départements officiels.

## Contrôle d'accès

Appliqué **côté serveur** sur chaque route de l'API (`server/middleware/auth.js`),
jamais seulement dans l'interface :

| Capacité | Corps pastoral | Patriarche | Resp. département | Fidèle |
|---|---|---|---|---|
| Voir toute l'assemblée | ✅ | — | — | — |
| Valider / rejeter les comptes, attribuer rôle, tribu, départements | ✅ | — | — | — |
| Créer et gérer tribus / départements, désigner les conducteurs | ✅ | — | — | — |
| Créer une fiche de présence d'assemblée | ✅ | — | — | — |
| Créer une fiche pour son équipe | ✅ | sa tribu | son département | — |
| Pointer les présences | tous | ses fidèles | ses membres | — |
| Fidèles, cotisations, demandes | tous | sa tribu | son département | lui-même |
| Statistiques | globales | sa tribu | son département | personnelles |
| Annonces WhatsApp | toute cible | sa tribu | son département | — |

**Confidentialité** : les demandes d'un fidèle ne sont jamais visibles par les
autres fidèles — uniquement par les pasteurs, son patriarche et le responsable
de son département.

## Annonces WhatsApp

1. Le responsable rédige une annonce (titre + message) et choisit la cible
   (assemblée, tribu ou département, dans la limite de son périmètre).
2. L'application génère **un lien `wa.me` pré-rempli par destinataire** et un
   bouton « copier le message groupé » ; l'annonce est archivée dans l'historique.
3. **Évolution prévue** : implémenter `sendViaApi()` dans
   `server/services/whatsapp.js` (Twilio ou Meta WhatsApp Cloud API) puis passer
   `WHATSAPP_PROVIDER=api` — aucune autre modification nécessaire.

## Sécurité

- Mots de passe hachés avec bcrypt (jamais en clair)
- Session JWT en cookie `httpOnly` + `SameSite=Lax` (protection XSS / CSRF de base)
- Message de connexion identique compte inexistant / mauvais mot de passe
  (empêche l'énumération de comptes)
- Requêtes SQL 100 % paramétrées (aucune injection possible)
- Échappement HTML systématique côté client (`esc()`)
- Un patriarche ne peut ni lire ni écrire hors de sa tribu, même en forgeant des
  requêtes : les pointages hors périmètre sont silencieusement ignorés et
  comptabilisés dans la réponse
- Un fidèle n'accède qu'à ses propres données
