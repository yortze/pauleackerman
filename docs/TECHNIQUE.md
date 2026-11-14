# Documentation technique

Installation, déploiement et fonctionnement interne du portfolio. La présentation du projet est dans le [README](../README.md).

## L'espace pro (`/admin`)

**Pilotage**
- **Accueil** : profil façon réseau social, à faire du jour (relances, rendez-vous,
  demandes non lues), équipe IA, activité récente, chiffres du site sur 30 jours
- **Messages** : boîte de réception en deux panneaux ; pour chaque demande : besoin,
  budget, délai, suivi (étape, montant, relance, notes), analyse IA et brouillons
  de réponse email/WhatsApp
- **Équipe IA** : trois assistantes avec qui Paule discute comme avec des contacts
  (conversations enregistrées) :
  - **Nadia** (relation client, OpenAI) — analyse les demandes, prépare les réponses
  - **Yann** (prospection, Claude) — cherche des clients sur le web, audite leur présence en ligne
  - **Awa** (bras droit, OpenAI) — rendez-vous, relances, suivi des contacts, et conseil : prix et marges
    à prendre, attentes de chaque client, grands points à retenir ; elle note les tâches dans le bloc-notes
  - **Débriefs d’équipe** : Paule réunit les trois sur un sujet ou un client ; Nadia et Yann répondent, puis
    Awa fait la synthèse (grands points, à faire). « @Nadia », « @Yann » ou « @Awa » : seule la personne citée répond
  - **Bloc-notes** : tâches à faire (client, échéance), cochées par Paule ou par Awa
- **Prospects** : pipeline en colonnes (glisser-déposer), fiche détaillée, audit, message d'approche
- **Agenda** : vue semaine, disponibilités, réservation d'appel depuis le site. Chaque rendez-vous
  peut s'ajouter tout seul à son Google Agenda, avec ses notifications (voir plus bas)
- **Audience** : visites, sources, appareils, pays, heures de visite, contenus vus,
  entonnoir de conversion, liens de suivi avec QR code, export CSV (statistiques
  anonymes : ni cookie, ni IP)

**Mon site** : publications (avec leur vraie date), créations, vidéos, études de cas,
registre, formules, avis clients, profil, à propos.

**Réglages** : mot de passe, thème, exclusion de ses propres visites, Google Agenda, état des alertes
email et de l'équipe IA.

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
   | `OPENAI_API_KEY` | clé OpenAI (platform.openai.com) — active Nadia et Awa |
   | `RESEND_API_KEY` + `NOTIFY_EMAIL` | facultatif — email à Paule à chaque demande et rendez-vous |
   | `GOOGLE_CALENDAR_ID` + `GOOGLE_SERVICE_ACCOUNT` | facultatif — rendez-vous ajoutés à son Google Agenda (voir plus bas) |

   Sans clé, l'assistante concernée affiche simplement « clé manquante ». Garde-fou :
   1 million de tokens par jour et par assistante (`AI_DAILY_TOKENS`) ; une tâche
   en cours s'arrête si le budget est atteint. Modèles : Yann (recherche web, le
   travail lourd) sur `claude-opus-5-5` (`CLAUDE_MODEL`) ; Nadia et Awa, aux tâches
   simples, sur le modèle léger `gpt-5.4-mini` avec peu de réflexion
   (`OPENAI_MODEL_DIAGNOSTIC`, `OPENAI_MODEL_AGENDA`, `OPENAI_REASONING_EFFORT`).

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

## Notes techniques

- Sans `MONGODB_URI`, le serveur retombe sur un stockage JSON local — parfait en
  local, **insuffisant sur Vercel** (écritures perdues à chaque redéploiement).
- Les médias du dépôt (`client/media/`) sont servis statiquement avec cache long.
  Avec Cloudinary, les imports de l'admin sont servis par le CDN Cloudinary
  (images en `f_auto,q_auto`). Sans Cloudinary, ils sont servis sur
  `/api/media/:id` (support des Range requests pour les vidéos sur iOS/Safari).
  Les anciens liens `/api/media/:id` restent valides : ils redirigent vers le CDN.
- Supprimer un média depuis la médiathèque le supprime aussi sur Cloudinary.
- Connexion admin : JWT 12 h, anti-bruteforce (5 essais / 10 min / IP), mot de passe
  hashé bcrypt.
- Boîte DM du site : honeypot, délai minimum de saisie, 20 s entre deux envois,
  5 messages / jour / IP et 80 / jour au total. Les compteurs sont **en base**
  (un compteur en mémoire ne protège de rien en serverless), et la clé est une
  empreinte HMAC de l'IP — l'IP en clair n'est jamais stockée. Les messages
  bourrés de liens sont marqués « spam probable » sans être jetés.
- Onglet Messages de l'admin : filtres (tous / non lus / lus / spam), recherche,
  pagination, « tout marquer comme lu » et bouton « Répondre » qui ouvre la
  messagerie de Paule avec la réponse déjà préparée.
