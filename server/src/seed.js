// Données initiales — le contenu actuel du portfolio, injecté au premier
// démarrage si les collections sont vides. Ensuite tout se gère depuis /admin.
const { col } = require("./store");

const profile = {
  key: "profile",
  nom: "Paule Ackerman",
  handle: "@paule_ackerman",
  titre: "Social media manager & créatrice de contenu",
  bioAccroche: "Une marque forte naît d'une équipe soudée",
  bio: "— passionnée de communication digitale, je fais rayonner votre identité en ligne. Création de contenu, montage vidéo & gestion de communautés.",
  localisation: "Libreville, Gabon",
  telephone: "076 21 51 55",
  email: "roxanebillie@gmail.com",
  photo: "/media/asset-01-90d3c5eb78.jpg",
  stats: [
    { valeur: "16", label: "créations" },
    { valeur: "5", label: "marques" },
    { valeur: "5", label: "certifs" },
  ],
  disponibilite: "En ligne — répond rapidement",
  accrocheContact: "Disponible pour vos projets de communication digitale. Réponse rapide garantie.",
  dmBienvenue: "Bonjour ! Ravie de vous lire. Dites-moi tout sur votre marque et votre projet — je reviens vers vous très vite.",
  dmReponse: "Merci pour votre message ! Je l'ai bien reçu. Je reviens vers vous en détail par email sous 24 h ouvrées — à très vite.",
  reseaux: [
    { nom: "Instagram", detail: "@paule_ackerman", url: "https://instagram.com/paule_ackerman" },
    { nom: "TikTok", detail: "@paule.ackerman.cm", url: "https://tiktok.com/@paule.ackerman.cm" },
    { nom: "Vimeo", detail: "Mes vidéos", url: "https://vimeo.com/user258803029" },
    { nom: "LinkedIn", detail: "Roxane Billie", url: "https://linkedin.com/in/roxane-billie-360331383" },
  ],
  certifsCote: [
    { titre: "Marketing digital & e-commerce", org: "Ateliers Google · 2025", initiale: "G" },
    { titre: "Meta Ads & Social Media Manager", org: "Coursera · 2025", initiale: "C" },
    { titre: "Création de contenu & maîtrise de Canva", org: "Domestika · 2025", initiale: "D" },
  ],
};

const apropos = {
  key: "apropos",
  introTitre: "Bonjour, moi c'est Paule.",
  introLead: "Une marque forte naît d'une équipe soudée.",
  introParagraphes: [
    "Je m'appelle Paule Roxane Bibang Billie — « Paule Ackerman » est mon nom de créatrice. Social media manager basée à Libreville, je suis passionnée par le management et la communication via les réseaux sociaux.",
    "Mon objectif : faire rayonner votre identité en ligne en tirant le meilleur de chaque collaborateur. Création de contenu, montage vidéo, gestion de communautés et conception de visuels — j'accompagne les marques sur l'ensemble de leur présence digitale.",
  ],
  parcours: [
    { annee: "2026", titre: "Stratégie de communication digitale — Go For Success", detail: "· app web éducative (prépa INSG/IST), depuis juillet" },
    { annee: "2026", titre: "Social Media Manager — Folie Douce", detail: "· Libreville, avril → juin" },
    { annee: "2026", titre: "Designer graphique — Les Retrouvailles", detail: "· identité d'un restaurant-bar, mai" },
    { annee: "2025", titre: "Assistante community manager — Georgie Empire", detail: "· institut de beauté, juin → oct." },
    { annee: "2022", titre: "Assistante informatique — CECA GADIS", detail: "· Owendo, juil. → sept." },
    { annee: "2022", titre: "Études supérieures", detail: "· Université de Libreville" },
  ],
  services: [
    { titre: "Gestion des réseaux sociaux", detail: "Gestion de communautés multicanales, modération proactive, animation de la présence en ligne." },
    { titre: "Veille & analyse", detail: "Veille de tendances sociales, benchmarks concurrents, analyse de campagnes et KPIs (engagement, reach, CAC, CPA)." },
    { titre: "Création de contenu & montage vidéo", detail: "Contenus pour TikTok, Instagram et Facebook, montage vidéo et création de visuels." },
    { titre: "Identité visuelle & flyers", detail: "Conception de l'univers de marque, création de flyers et de supports promotionnels." },
  ],
  outilsMaitrise: ["Canva", "CapCut", "Photoshop", "Première Pro", "Illustrator 3D", "Lightroom", "Meta Business Suite", "Google Analytics 4"],
  outilsApprentissage: ["After Effects", "Cinema 4D Lite", "Figma", "Notion", "Later"],
  langues: [
    { nom: "Français", niveau: "key" },
    { nom: "Anglais — B1", niveau: "" },
  ],
  certifications: [
    { annee: "2025", titre: "Marketing digital & e-commerce", detail: "· Ateliers Google, en ligne" },
    { annee: "2025", titre: "Meta Ads & Social Media Manager", detail: "· Coursera, à distance" },
    { annee: "2025", titre: "Création de contenu", detail: "· Domestika — Première Pro, CapCut, réseaux sociaux" },
    { annee: "2025", titre: "Maîtrise de Canva", detail: "· Domestika, dirigée par Claudio Canva" },
  ],
  atouts: ["Ponctualité", "Polyvalence", "Créativité & idées novatrices", "Grande capacité d'adaptation"],
};

const posts = [
  {
    ordre: 1,
    epingle: true,
    date: "il y a 1 j",
    tag: "Projet client · stratégie digitale",
    type: "photo",
    images: ["/media/asset-03-cb2395b643.jpg"],
    alt: "Visuel campagne Go For Success — 2% de réussite au concours INSG",
    texteGras: "Stratégie de communication digitale pour Go For Success",
    texte: ", application web éducative dédiée à la préparation aux concours des grandes écoles (INSG, IST). Phase de pré-lancement sur 2 mois : création de visuels d'accroche pour capter l'attention sur les enjeux du concours.",
    chips: ["Stratégie pré-lancement", "Création de contenu", "Concours INSG/IST"],
  },
  {
    ordre: 2,
    date: "il y a 1 j",
    tag: "Projet client · stratégie digitale",
    type: "photo",
    images: ["/media/asset-04-b41517a13b.jpg"],
    alt: "Visuel campagne Go For Success — 98% des candidats ratent la question piège",
    texteGras: "Deuxième visuel de la campagne Go For Success.",
    texte: " Mise en avant d'un fait marquant (question piège du concours) pour susciter l'engagement et rediriger vers l'application dès son lancement.",
    chips: ["Copywriting", "Design social media"],
  },
  {
    ordre: 3,
    date: "il y a 3 j",
    tag: "Projet client · décoration",
    type: "video",
    video: "/media/foliedouce.mp4",
    poster: "/media/asset-05-ca6f993841.jpg",
    texteGras: "Social media management pour Folie Douce, bazar de décoration à Libreville.",
    texte: " Création de contenu vidéo, gestion des réseaux et suivi des indicateurs de performance. Mission réalisée d'avril à juin 2026.",
    chips: ["Création de contenu vidéo", "Gestion des réseaux", "Analyse des KPI"],
  },
  {
    ordre: 4,
    date: "il y a 6 j",
    tag: "Projet client · identité visuelle",
    type: "photo",
    images: ["/media/asset-06-07be74fc42.jpg", "/media/asset-30-df1dc107cf.jpg", "/media/asset-31-cc25fb5299.jpg", "/media/asset-32-570f1c0418.jpg"],
    alt: "Logo Les Retrouvailles",
    texteGras: "Création de l'identité graphique de Les Retrouvailles, restaurant-bar à Libreville.",
    texte: " Conception du logo, de la palette de couleurs et de l'univers de marque pour le lancement de l'établissement.",
    chips: ["Logo & déclinaisons", "Charte graphique"],
  },
  {
    ordre: 5,
    date: "il y a 2 sem",
    tag: "Événement · visuels de communication",
    type: "photo",
    images: ["/media/asset-07-9263bb41bb.jpg"],
    alt: "Affiche récompenses TheTytyShow, 3e édition",
    texteGras: "Visuels de communication pour TheTytyShow",
    texte: ", événement de divertissement (3e édition). Création de l'affiche de présentation des récompenses du concours.",
    chips: ["Design d'affiche", "Communication événementielle"],
  },
  {
    ordre: 6,
    date: "il y a 2 sem",
    tag: "Événement · visuels de communication",
    type: "photo",
    images: ["/media/asset-08-bba28142c1.jpg"],
    alt: "Affiche sponsors TheTytyShow, 3e édition",
    texteGras: "Affiche de remerciement aux sponsors de TheTytyShow.",
    texte: " Mise en avant des partenaires de la 3e édition de l'événement.",
    chips: ["Design d'affiche", "Partenariats"],
  },
  {
    ordre: 7,
    date: "il y a 1 sem",
    type: "texte",
    texte: "Je crois qu'une marque forte naît d'une équipe soudée. Mon objectif : faire rayonner votre identité en ligne en tirant le meilleur de chaque collaborateur.",
  },
  {
    ordre: 8,
    date: "il y a 2 sem",
    tag: "Projet client · institut de beauté",
    type: "photo",
    images: ["/media/asset-09-37d1ab29c1.jpg"],
    alt: "Logo Géorgie Empire — Institut de beauté",
    texteGras: "Assistante community manager pour Georgie Empire, institut de beauté.",
    texte: " Contenus promotionnels, présentation de l'institut à sa cible, création d'une fiche Google Maps pour la visibilité locale.",
    chips: [],
  },
  {
    ordre: 9,
    date: "il y a 3 sem",
    type: "partage",
    partageDe: "Ateliers Google",
    partageInitiale: "G",
    partageSous: "Certification obtenue",
    partageTexte: "Certification en marketing digital & e-commerce — délivrée par les Ateliers Google, octobre 2025.",
    texte: "Une formation qui structure tout mon travail au quotidien.",
  },
];

const creations = [
  { ordre: 1, image: "/media/asset-10-835497f91f.jpg", titre: "Go For Success — visuel d'accroche 98%", tag: "client" },
  { ordre: 2, image: "/media/asset-11-d987e6eeaf.jpg", titre: "Go For Success — visuel d'accroche 2%", tag: "client" },
  { ordre: 3, image: "/media/asset-12-f398afc919.jpg", titre: "TheTytyShow — affiche récompenses", tag: "client" },
  { ordre: 4, image: "/media/asset-13-bc01b44225.jpg", titre: "TheTytyShow — affiche sponsors", tag: "client" },
  { ordre: 5, image: "/media/asset-14-568fc4776e.jpg", titre: "Lynn's Restaurant — flyer", tag: "perso" },
  { ordre: 6, image: "/media/asset-15-0fae369bb5.jpg", titre: "Mercedes AMG 63S — affiche", tag: "exercice" },
  { ordre: 7, image: "/media/asset-16-565ccc74d7.jpg", titre: "Game Day NBA — affiche sportive", tag: "exercice" },
  { ordre: 8, image: "/media/asset-17-2868ad2efe.jpg", titre: "MasterPiece Dakar — flyer", tag: "perso" },
  { ordre: 9, image: "/media/asset-18-030b079db2.jpg", titre: "Denim — affiche mode", tag: "perso" },
  { ordre: 10, image: "/media/asset-19-ef1c9e036a.jpg", titre: "Lecœur Nails — flyer services", tag: "perso" },
  { ordre: 11, image: "/media/asset-20-74750d247e.jpg", titre: "Code Casa — vœux de sécurité", tag: "perso" },
  { ordre: 12, image: "/media/asset-21-59cb55d092.jpg", titre: "Clear Your Mind — direction artistique", tag: "perso" },
  { ordre: 13, image: "/media/asset-22-d04b295666.jpg", titre: "The Twin's Bakery — flyer pâtisserie", tag: "perso" },
  { ordre: 14, image: "/media/asset-23-c2c0113581.jpg", titre: "Divine — composition éditoriale", tag: "perso" },
  { ordre: 15, image: "/media/asset-24-b6d2bbfd6d.jpg", titre: "Medu's Nails — promo réseaux", tag: "perso" },
  { ordre: 16, image: "/media/asset-25-8fbfd30083.jpg", titre: "Chicken Wings vs Pasta — flyer food", tag: "perso" },
];

const videos = [
  { ordre: 1, video: "/media/foliedouce.mp4", poster: "/media/asset-05-ca6f993841.jpg", titre: "Folie Douce — contenu vidéo", tag: "client", section: "client" },
  { ordre: 2, video: "/media/foliedouce1.mp4", poster: "/media/asset-26-0f7dd6363b.jpg", titre: "Folie Douce — contenu court", tag: "client", section: "client" },
  { ordre: 3, video: "/media/glace.mp4", poster: "/media/asset-27-a0e85637e3.jpg", titre: "Saveurs de glace — pub en switch", tag: "perso", section: "perso" },
];

const etudes = [
  {
    ordre: 1,
    image: "/media/asset-28-b8e05f5e1c.jpg",
    meta: ["Application web éducative", "Libreville", "Depuis juillet 2026"],
    titre: "Stratégie digitale — Go For Success.",
    texte: "Stratégie de communication digitale pour Go For Success, application web éducative dédiée à la préparation aux concours des grandes écoles (INSG, IST). Plan déployé sur 2 mois dès la phase de pré-lancement : visuels d'accroche, copywriting et création de contenu pour capter l'attention des candidats.",
    chips: ["Stratégie pré-lancement", "Création de contenu", "Concours INSG/IST"],
  },
  {
    ordre: 2,
    image: "/media/asset-29-96156aa194.jpg",
    meta: ["Décoration & maison", "Libreville", "Avril – juin 2026"],
    titre: "Social media management de Folie Douce.",
    texte: "Mission de Social Media Manager (avril à juin 2026) : création de contenu vidéo, gestion quotidienne des réseaux sociaux et analyse des indicateurs de performance pour développer la présence en ligne de ce bazar d'articles et d'objets de décoration pour la maison.",
    chips: ["Création de contenu vidéo", "Gestion des réseaux", "Analyse KPI"],
  },
  {
    ordre: 3,
    large: true,
    image: "/media/asset-06-07be74fc42.jpg",
    meta: ["Restaurant-bar", "Libreville", "Mai 2026"],
    titre: "Identité graphique — Les Retrouvailles.",
    texte: "Mission de designer graphique : conception de l'identité visuelle complète du restaurant-bar « Les Retrouvailles by Larosa ». Logo et ses déclinaisons, palette de couleurs et choix typographiques pour son lancement.",
    chips: ["Logo & déclinaisons", "Charte graphique"],
    galerie: [
      { image: "/media/asset-06-07be74fc42.jpg", legende: "Version orange" },
      { image: "/media/asset-30-df1dc107cf.jpg", legende: "Version blanche" },
      { image: "/media/asset-31-cc25fb5299.jpg", legende: "Version noire" },
      { image: "/media/asset-32-570f1c0418.jpg", legende: "Charte couleurs & typo" },
    ],
  },
  {
    ordre: 4,
    image: "/media/asset-09-37d1ab29c1.jpg",
    meta: ["Institut de beauté", "Haut de Gué-Gué", "Juin — oct. 2025"],
    titre: "Assistante community manager pour un institut de beauté.",
    texte: "Élaboration de contenus promotionnels, présentation de l'institut à son public cible via les réseaux sociaux, création d'une fiche Google Maps pour améliorer la visibilité locale et gestion des réseaux.",
    chips: ["Contenus promotionnels", "Référencement local", "Gestion des réseaux"],
  },
];

const registre = [
  { ordre: 1, initiale: "G", nom: "Go For Success", badge: "en cours", detail: "App web éducative (prépa concours INSG/IST) · Stratégie communication digitale", periode: "depuis juillet 2026" },
  { ordre: 2, initiale: "F", nom: "Folie Douce", badge: "", detail: "Bazar de décoration · Social media manager", periode: "avril – juin 2026" },
  { ordre: 3, initiale: "R", nom: "Les Retrouvailles", badge: "", detail: "Restaurant-bar · Designer graphique", periode: "mai 2026" },
  { ordre: 4, initiale: "G", nom: "Georgie Empire", badge: "", detail: "Institut de beauté · Assistante CM", periode: "2025" },
  { ordre: 5, initiale: "C", nom: "CECA GADIS", badge: "", detail: "Owendo · Assistante informatique", periode: "2022" },
];

async function seed() {
  for (const [key, doc] of [["profile", profile], ["apropos", apropos]]) {
    if (!(await col("settings").findOne({ key }))) await col("settings").insert(doc);
  }
  const collections = { posts, creations, videos, etudes, registre };
  for (const [name, docs] of Object.entries(collections)) {
    if ((await col(name).count()) === 0) {
      for (const d of docs) await col(name).insert(d);
      console.log(`[seed] ${name} : ${docs.length} éléments`);
    }
  }
}

module.exports = { seed };
