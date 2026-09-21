# Portfolio Paule Ackerman — site + espace admin

Le portfolio est maintenant **full-stack** : le site public (design inchangé) lit son
contenu depuis une API, et Paule gère tout elle-même depuis **`/admin`** — sans dev.

## Ce que Paule peut faire depuis `/admin`

- **Publications** : ajouter / modifier / supprimer / réordonner les posts du feed
  (photo, carrousel, vidéo, texte, partage), épingler un post
- **Créations** : gérer la galerie de visuels (image + titre + étiquette)
- **Vidéos** : gérer les montages vidéo (fichier + couverture)
- **Études de cas** : les dossiers détaillés, avec galerie facultative
- **Registre** : la liste des marques accompagnées
- **Profil** : photo, bio, stats, contacts, réseaux sociaux, textes de la messagerie
- **À propos** : parcours, services, outils, langues, certifications, atouts
- **Messages** : lire les messages envoyés depuis la bulle « Envoyer un message » du site
- **Réglages** : changer son mot de passe

Les images/vidéos importées depuis l'admin partent sur **Cloudinary** (photo 10 Mo,
vidéo 100 Mo). Le fichier va directement du navigateur de Paule vers Cloudinary :
il ne traverse pas le serveur, donc la limite de taille des requêtes de Vercel
(~4,5 Mo) ne s'applique pas. Sans clés Cloudinary, le site retombe sur l'ancien
stockage en base (10 Mo max) — pratique en local.

## Structure

```
client/          site public (index.html + render.js) + admin.html + media/
server/          API Express (auth JWT, contenu, médias, messages)
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
