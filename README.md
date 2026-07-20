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

Les images/vidéos importées depuis l'admin sont stockées **dans la base de données**
(10 Mo max par fichier) — rien à configurer de plus.

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

4. *Deploy*. Le site est sur `https://<projet>.vercel.app`, l'admin sur `…/admin`.

Au premier démarrage, le contenu actuel du portfolio est injecté automatiquement
dans la base (seed). Ensuite, tout se gère depuis l'admin.

## Notes techniques

- Sans `MONGODB_URI`, le serveur retombe sur un stockage JSON local — parfait en
  local, **insuffisant sur Vercel** (écritures perdues à chaque redéploiement).
- Les médias du dépôt (`client/media/`) sont servis statiquement avec cache long ;
  les médias importés via l'admin sont servis sur `/api/media/:id` (support des
  Range requests pour les vidéos sur iOS/Safari).
- Connexion admin : JWT 12 h, anti-bruteforce (5 essais / 10 min / IP), mot de passe
  hashé bcrypt. La boîte DM du site a un honeypot + rate-limit anti-spam.
