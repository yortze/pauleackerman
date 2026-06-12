# Portfolio Paule Ackerman — Déploiement Vercel

Ce dossier est prêt à être déployé. Il contient :

- `index.html` — le portfolio
- `foliedouce.mp4`, `foliedouce1.mp4`, `glace.mp4` — les vidéos
- `vercel.json` — configuration de l'hébergement

## Déploiement (méthode glisser-déposer, la plus simple)

1. Aller sur **https://vercel.com** et créer un compte gratuit (avec Google ou GitHub, c'est plus rapide).
2. Une fois connecté, cliquer sur **"Add New..."** puis **"Project"**.
3. Choisir l'option **"Deploy a Template"** ou chercher **"Other"** / déploiement manuel.
   - Si tu ne vois pas l'option directe, va plutôt sur **https://vercel.com/new** puis tout en bas cherche un bouton qui mentionne "Import Folder" ou utilise la méthode via Vercel CLI ci-dessous.

### Méthode alternative (plus simple) — via le CLI Vercel

Si Vercel a changé son interface, la méthode la plus fiable est :

1. Ouvrir un terminal sur ton ordinateur.
2. Installer Vercel : `npm install -g vercel` (nécessite Node.js).
3. Aller dans ce dossier : `cd chemin/vers/ce/dossier`.
4. Lancer : `vercel`.
5. Suivre les questions (login, nom du projet, etc.). Vercel détecte que c'est un site statique et déploie tout seul.

### Méthode la plus simple — via GitHub

1. Créer un compte GitHub gratuit si tu n'en as pas (**https://github.com**).
2. Créer un nouveau dépôt (**"New repository"**), donne-lui un nom (ex. `portfolio-paule`).
3. Glisser-déposer **tous les fichiers de ce dossier** dans le dépôt (interface web GitHub).
4. Sur Vercel, **"Add New Project"** → choisir le dépôt GitHub que tu viens de créer → **"Deploy"**.
5. C'est tout. Vercel te donne une URL du type `portfolio-paule.vercel.app`.

## Après le déploiement

- Vercel te donne automatiquement une URL gratuite : `nom-du-projet.vercel.app`.
- Tu peux la partager directement (CV, LinkedIn, recruteurs).
- Pour un vrai nom de domaine (ex. `pauleackerman.com`), il faut l'acheter (~12 €/an) puis le connecter dans **Settings → Domains** sur Vercel.

## Mettre à jour le portfolio

Si tu as déployé via GitHub : tu remplaces les fichiers dans le dépôt, Vercel redéploie tout seul.
Si tu as déployé via CLI : tu relances `vercel --prod` dans le dossier.
Si tu as glissé-déposé : tu refais un déploiement manuel avec les nouveaux fichiers.

## Vérifier que ça marche

Une fois déployé :
- Ouvrir l'URL Vercel
- Vérifier que les vidéos se lancent (lecture, son)
- Tester sur mobile aussi
- Vérifier les liens externes (Instagram, TikTok, Vimeo, LinkedIn)
"# pauleackerman" 
