# Documentation technique

Installation, déploiement et fonctionnement interne du portfolio. La présentation du projet est dans le [README](../README.md).

## L'espace pro (`/admin`)

**Pilotage**
- **Accueil** : profil façon réseau social, à faire du jour (relances, rendez-vous,
  demandes non lues), équipe IA, activité récente, chiffres du site sur 30 jours
- **Messages** : boîte de réception en deux panneaux ; pour chaque demande : besoin,
  budget, délai, suivi (étape, montant, relance, notes), analyse IA et brouillons
  de réponse email/WhatsApp
- **Équipe IA** : quatre assistantes avec qui Paule discute comme avec des contacts
  (conversations enregistrées) :
  - **Nadia** (relation client, OpenAI) — analyse les demandes, prépare les réponses
  - **Yann** (prospection, Claude) — cherche des clients sur le web, audite leur présence en ligne
  - **Léa** (contenu et bilans, OpenAI) — légendes, scripts, idées de publications ajoutées au
    calendrier (toujours au stade « idée »), bilans du mois rédigés à partir des captures de statistiques
  - **Awa** (bras droit, OpenAI) — rendez-vous, relances, suivi des contacts, devis en brouillon, état
    des finances, et conseil : prix et marges, attentes de chaque client ; elle note les tâches dans le bloc-notes
  - **Débriefs d’équipe** : Paule réunit l’équipe sur un sujet ou un client ; chacune répond, puis
    Awa fait la synthèse (grands points, à faire). « @Nadia », « @Yann », « @Léa » ou « @Awa » : seule la personne citée répond
  - **Mémoire de l’équipe** : notes que toutes relisent à chaque échange (6 000 caractères, épinglées
    en premier). Les assistantes **proposent** (« retiens que… », leçons d’une affaire gagnée ou perdue) ;
    rien n’est retenu sans l’accord de Paule. Ses corrections (pouce baissé sous une réponse) entrent directement
  - **Raccourcis** (bouton éclair), **dictée vocale** (micro, Chrome et Safari) et **suites proposées**
    sous chaque réponse
  - **Bloc-notes** : tâches à faire (client, échéance), cochées par Paule ou par Awa
  - **Pièces jointes** : captures d’écran et documents (PDF, Word, Excel, PowerPoint, CSV, texte), joints
    avec le trombone, collés ou glissés dans une discussion ou un débrief. Indispensables pour TikTok,
    Facebook, Instagram et LinkedIn, qui bloquent la lecture web de Yann (voir Notes techniques)
- **Prospects** : pipeline en colonnes (glisser-déposer), fiche détaillée, audit, message d'approche
- **Clients** : fiche par client (aperçu, documents, calendrier, bilans, brief, coûts), créée à partir
  d’une demande ou d’un prospect gagné ; liens à partager, modèles de messages (variables et liens remplis)
- **Calendrier** : planning éditorial par client (idée → création → à valider → validé → publié),
  commentaires, retouches demandées par les clients
- **Finances** : devis et factures numérotés (D-2026-001, F-2026-001), acompte et solde, paiements,
  facturation du mois des abonnements, encaissé et coûts par mois, retards, marge par client,
  coordonnées de facturation (NIF, RCCM, mentions)
- **Agenda** : vue semaine, disponibilités, réservation d'appel depuis le site. Chaque rendez-vous
  peut s'ajouter tout seul à son Google Agenda, avec ses notifications (voir plus bas)
- **Audience** : visites, sources, appareils, pays, heures de visite, contenus vus,
  entonnoir de conversion, liens de suivi avec QR code, export CSV (statistiques
  anonymes : ni cookie, ni IP)

**Mon site** : publications (avec leur vraie date), créations, vidéos, études de cas,
registre, formules, avis clients, profil, à propos, et **Référencement** : bilan noté sur 100
(textes, profil, contenu, présence sur Google), aperçu du résultat Google, titre, description
et mots-clés visés, validation Google Search Console, lien de la fiche Google.

**Réglages** : identité de marque, mot de passe, **double authentification**, thème, exclusion de
ses propres visites, Google Agenda, **brief du matin**, **notifications et application**,
**sauvegarde des données** (export JSON), état des alertes email et de l'équipe IA.

**Pages des clients** (`/lien/<jeton>`, sans compte) : valider les publications ou demander une
retouche, remplir le brief de démarrage, laisser un avis (publié seulement après accord de Paule),
lire et accepter un devis, lire une facture ou le bilan du mois (impression en PDF par le navigateur).

Les images/vidéos importées depuis l'admin partent sur **Cloudinary** (photo 10 Mo,
vidéo 100 Mo). Le fichier va directement du navigateur de Paule vers Cloudinary :
il ne traverse pas le serveur, donc la limite de taille des requêtes de Vercel
(~4,5 Mo) ne s'applique pas. Sans clés Cloudinary, le site retombe sur l'ancien
stockage en base (10 Mo max) — pratique en local.

## Structure

```
client/          site public (index.html + app.js) + espace pro (admin.html + admin-*.js) + media/
server/          API Express (auth JWT, contenu, médias, messages, CRM, agenda, audience, IA)
api/index.js     enveloppe serverless pour Vercel
sources/         photos d'origine (non publiées)
```

## Lancer en local

```bash
npm --prefix server install
npm run dev          # → http://localhost:5051  (admin : /admin)
```

Sans configuration, les données vont dans `server/data/*.json` (fichiers locaux).
Mot de passe admin par défaut : `paule-admin` (à changer dès la première connexion).

## Déployer sur Vercel

1. **Base de données (obligatoire en production)** : créer un cluster gratuit sur
   [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) → bouton *Connect* → copier
   l'URI (`mongodb+srv://…`). Sans elle, les modifications de Paule ne seraient pas
   conservées (le disque de Vercel est éphémère).
2. Sur Vercel → *Add New Project* → importer ce dépôt GitHub.
3. Dans *Settings → Environment Variables*, ajouter :

   | Variable | Valeur |
   |---|---|
   | `MONGODB_URI` | l'URI Atlas copiée à l'étape 1 |
   | `JWT_SECRET` | une longue phrase aléatoire (secret de session) |
   | `ADMIN_PASSWORD` | le premier mot de passe de Paule |
   | `CLOUDINARY_CLOUD_NAME` | *Cloud name* du dashboard Cloudinary |
   | `CLOUDINARY_API_KEY` | *API key* du dashboard Cloudinary |
   | `CLOUDINARY_API_SECRET` | *API secret* du dashboard Cloudinary |
   | `ANTHROPIC_API_KEY` | clé Claude (console.anthropic.com) — active Yann, la prospection |
   | `OPENAI_API_KEY` | clé OpenAI (platform.openai.com) — active Nadia, Léa et Awa |
   | `RESEND_API_KEY` + `NOTIFY_EMAIL` | facultatif — email à Paule à chaque demande et rendez-vous, et brief du matin |
   | `CRON_SECRET` | recommandé — protège le déclenchement quotidien du brief du matin |
   | `GOOGLE_CALENDAR_ID` + `GOOGLE_SERVICE_ACCOUNT` | facultatif — rendez-vous ajoutés à son Google Agenda (voir plus bas) |

   Sans clé, l'assistante concernée affiche simplement « clé manquante ». Garde-fou :
   1 million de tokens par jour et par assistante (`AI_DAILY_TOKENS`) ; une tâche
   en cours s'arrête si le budget est atteint. Modèles : Yann (recherche web, captures,
   PDF) sur `claude-haiku-5-5`, 20 fois moins cher que `claude-sonnet-5-5`, qui fouille
   davantage (`CLAUDE_MODEL`) ; Nadia, Léa et Awa, aux tâches simples, sur le modèle léger
   `gpt-5.4-mini` avec peu de réflexion (`OPENAI_MODEL_DIAGNOSTIC`, `OPENAI_MODEL_CONTENU`,
   `OPENAI_MODEL_AGENDA`, `OPENAI_REASONING_EFFORT`). Claude relit le début des conversations
   depuis son cache (10 % du prix).

   Les trois clés Cloudinary se trouvent sur le dashboard, encadré *Product
   Environment Credentials*. On peut aussi coller la seule variable
   `CLOUDINARY_URL` (`cloudinary://clé:secret@cloud`) : elle contient les trois.
   `.env.example` liste tout, avec les variantes optionnelles.

   > L'`API secret` ne quitte jamais le serveur : l'admin lui demande une
   > signature d'upload, puis envoie le fichier à Cloudinary avec cette
   > signature. Le dossier de destination est signé lui aussi, et la réponse de
   > Cloudinary est re-vérifiée côté serveur avant d'être enregistrée.

4. *Deploy*. Le site est sur `https://<projet>.vercel.app`, l'admin sur `…/admin`.

Au premier démarrage, le contenu actuel du portfolio est injecté automatiquement
dans la base (seed). Ensuite, tout se gère depuis l'admin.

## Google Agenda (facultatif)

Chaque rendez-vous (réservé sur le site, créé par Awa ou ajouté dans l'admin) est
ajouté au Google Agenda de Paule, mis à jour s'il est déplacé ou confirmé, et retiré
s'il est annulé ou supprimé. Les notifications sont celles de Google Agenda, sur son
téléphone et dans Chrome. Mise en place, une seule fois :

1. Sur [console.cloud.google.com](https://console.cloud.google.com), créer un projet
   et activer **Google Calendar API** (API et services → Bibliothèque).
2. *IAM et administration → Comptes de service* : créer un compte de service, puis
   dans son onglet *Clés*, ajouter une clé au format **JSON** (un fichier se télécharge).
3. Dans Google Agenda : *Paramètres et partage* de l'agenda → *Partager avec des
   personnes spécifiques* → ajouter l'adresse du compte de service (`…@….iam.gserviceaccount.com`)
   avec le droit **Apporter des modifications aux événements**.
4. Dans Vercel : `GOOGLE_CALENDAR_ID` = l'adresse Gmail de Paule, et
   `GOOGLE_SERVICE_ACCOUNT` = le contenu du fichier JSON (tel quel, ou encodé en base64).
   Redéployer.
5. Dans l'admin, *Réglages → Google Agenda* : **Tester la connexion**, puis
   **Envoyer les rendez-vous à venir** pour ajouter ceux qui existaient déjà.
6. Dans Google Agenda, régler les *Notifications d'événements* de l'agenda
   (par exemple 30 minutes et 1 jour avant), et autoriser les notifications de
   l'app Google Agenda sur le téléphone et de calendar.google.com dans Chrome.

Chaque événement a un identifiant tiré de celui du rendez-vous : rien de plus n'est
stocké, et renvoyer un rendez-vous ne crée jamais de doublon. Une erreur de Google ne
bloque jamais une réservation ; elle s'affiche dans Réglages avec la marche à suivre.
`/api/health` indique `googleAgenda: true` quand les deux variables sont présentes.

## Brief du matin

`vercel.json` déclare une tâche planifiée (`crons`) qui appelle `GET /api/cron/brief` chaque
jour à 6 h UTC (7 h à Libreville ; sur le plan Hobby, Vercel la lance dans l'heure). Le
serveur compose la journée (rendez-vous, publications du jour, retouches, relances, demandes
non lues, factures en retard ou dues, renouvellements de la semaine, avis et leçons à valider)
et l'envoie par email (Resend) et en notification sur les appareils abonnés.

- Avec `CRON_SECRET`, Vercel envoie `Authorization: Bearer <CRON_SECRET>` et rien d'autre
  n'est accepté. Sans secret, seul l'agent `vercel-cron/…` est accepté.
- Un seul brief par jour (verrou en base, posé avant l'envoi). Les jours calmes, rien ne part,
  sauf si Paule coche « Le recevoir aussi les jours calmes ».
- *Réglages → Brief du matin* : activer ou arrêter, aperçu, envoi de test.

## Notifications et application installable

L'espace pro a un manifeste (`/api/manifest-admin`, icônes `client/media/app-*.png` ou le logo
de Paule s'il est sur Cloudinary) et un service worker (`client/admin-sw.js`, portée `/admin`)
qui affiche les notifications et une page « hors ligne ». Il ne met rien en cache.

- Notifications **Web Push** (bibliothèque `web-push`) : nouvelle demande, rendez-vous réservé,
  validation ou retouche d'un client, brief rempli, avis reçu, devis accepté, brief du matin.
  Paule les active par appareil et choisit les types dans *Réglages → Notifications et application*.
- Clés VAPID : créées au premier usage et gardées en base (`settings.push_vapid`, jamais exportées),
  ou fixées par `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`).
  Les changer oblige à réactiver les notifications sur chaque appareil.
- Seuls les services de notification des navigateurs (Google, Mozilla, Apple, Microsoft) sont
  acceptés comme destination. Un appareil désabonné (404/410) est retiré tout seul.
- Sur iPhone (iOS 16.4 ou plus) : il faut d'abord ajouter l'espace pro à l'écran d'accueil
  depuis Safari, puis l'ouvrir depuis son icône pour activer les notifications.

## Double authentification

TOTP (RFC 6238, codes à 6 chiffres de Google Authenticator, Microsoft Authenticator, 2FAS…),
sans dépendance (`server/src/totp.js`). Activation dans *Réglages* : QR code, saisie d'un code,
puis 8 codes de secours à usage unique (affichés une seule fois, stockés en empreinte HMAC).

- Le secret est chiffré en base (AES-256-GCM, clé dérivée de `JWT_SECRET`). Changer
  `JWT_SECRET` rend le secret illisible : il faut alors désactiver puis réactiver.
- Connexion : mot de passe → ticket de 5 minutes (il n'ouvre aucune route de l'admin) → code.
  Un code déjà utilisé est refusé (pas de rejeu).
- **Secours** (téléphone et codes perdus) : ajouter `ADMIN_2FA_OFF=1` dans Vercel et redéployer ;
  la connexion ne demande plus de code. Se reconnecter, désactiver ou réactiver la double
  authentification, puis retirer la variable.

## Référencement

Le titre et la description réglés dans *Mon site → Référencement* sont appliqués par la page
(`app.js`, via `/api/all`) : Google lit la page affichée. Les données structurées (JSON-LD)
reprennent le téléphone, l'email et les réseaux du profil. L'aperçu de partage (Open Graph,
WhatsApp, Facebook) reste celui écrit dans `client/index.html`, car ces robots ne lancent pas
le JavaScript. La validation Search Console utilise la méthode « fichier HTML » : le fichier
`/google<code>.html` est servi par l'API (réécriture dans `vercel.json`).

## Notes techniques

- Sans `MONGODB_URI`, le serveur retombe sur un stockage JSON local — parfait en
  local, **insuffisant sur Vercel** (écritures perdues à chaque redéploiement).
- Les médias du dépôt (`client/media/`) sont servis statiquement avec cache long.
  Avec Cloudinary, les imports de l'admin sont servis par le CDN Cloudinary
  (images en `f_auto,q_auto`). Sans Cloudinary, ils sont servis sur
  `/api/media/:id` (support des Range requests pour les vidéos sur iOS/Safari).
  Les anciens liens `/api/media/:id` restent valides : ils redirigent vers le CDN.
- Supprimer un média depuis la médiathèque le supprime aussi sur Cloudinary.
- Connexion admin : JWT 12 h, mot de passe hashé bcrypt, double authentification facultative.
  Anti-bruteforce compté **en base** (collection `tentatives`) : 5 échecs en 10 min par IP ;
  au-delà de 60 échecs en une heure sur tout le site, une IP qui s'est déjà trompée attend.
- Liens des clients (`server/src/routes/liens.js`) : jeton aléatoire de 144 bits par lien,
  régénérable depuis la fiche client. Pages `noindex`, sans cache ni referrer. Envois limités
  par jour et par IP (empreinte HMAC), champ piège anti-robot. Un avis n'est publié qu'après
  accord de Paule ; un devis accepté en ligne garde le nom saisi et la date.
- Mémoire de l'équipe (`server/src/ai/memoire.js`) : une proposition d'assistante reste
  « à valider » tant que Paule ne l'a pas retenue (protection contre une consigne glissée
  dans une demande ou une page web). « Non » sur une proposition déjà retenue est refusé.
- Sauvegarde (`GET /api/crm/export`) : toutes les collections utiles en JSON compressé, sans
  mot de passe, double authentification, clés privées, fichiers joints ni jetons des liens clients.
- Boîte DM du site : honeypot, délai minimum de saisie, 20 s entre deux envois,
  5 messages / jour / IP et 80 / jour au total. Les compteurs sont **en base**
  (un compteur en mémoire ne protège de rien en serverless), et la clé est une
  empreinte HMAC de l'IP — l'IP en clair n'est jamais stockée. Les messages
  bourrés de liens sont marqués « spam probable » sans être jetés.
- Onglet Messages de l'admin : filtres (tous / non lus / lus / spam), recherche,
  pagination, « tout marquer comme lu » et bouton « Répondre » qui ouvre la
  messagerie de Paule avec la réponse déjà préparée.
- Pièces jointes de l'équipe IA (`client/admin-pieces.js`, `server/src/ai/pieces.js`) :
  préparées dans le navigateur avant l'envoi. Les images deviennent des JPEG de 2576 px
  au plus (la résolution maximale de Claude). Word, Excel, PowerPoint et CSV sont
  convertis en texte, sans leurs images : pour un document illustré, l'envoyer en PDF.
  Les PDF partent tels quels, 3 Mo au plus (limite de 4,5 Mo par requête de Vercel).
  Le serveur vérifie que le contenu correspond au type annoncé, puis stocke chaque
  pièce en base (collection `pieces`). Il les efface au bout de 90 jours, quand la
  discussion est effacée ou quand le débrief est supprimé. À chaque tour, l'assistante
  relit les pièces des 6 derniers messages, 8 au plus. Les plus anciennes sont
  remplacées par leur nom.
- TikTok, Facebook, Instagram et LinkedIn bloquent la lecture web de Claude (robots).
  Yann ne tente plus de les ouvrir et demande des captures d'écran du profil.
