// Référencement (SEO) : titre et description lus par Google, mots-clés visés,
// bilan du site et vérification Google Search Console (méthode « fichier HTML »).
// Le titre et la description sont appliqués par la page du site (Google lit la
// page affichée) ; l'aperçu de partage (WhatsApp, Facebook) reste celui du HTML.
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const o = require("../outils");

const router = express.Router();
const route = o.enveloppe("seo");

const CLE = "seo";
const SEO_DEFAUT = {
  titre: "Paule Ackerman — Community manager à Libreville (Gabon)",
  description: "Community manager à Libreville : gestion de vos réseaux sociaux, création de contenu, montage vidéo et visuels. Devis rapide par message ou WhatsApp.",
  motsCles: ["community manager Libreville", "social media manager Gabon", "création de contenu Libreville", "montage vidéo Gabon"],
  verificationGoogle: "",
  ficheGoogle: "",
};
const FICHIER_GOOGLE = /google[0-9a-z]{6,64}\.html/i;

async function lire() {
  const r = await o.reglage(CLE, SEO_DEFAUT);
  return {
    titre: String(r.titre || SEO_DEFAUT.titre), description: String(r.description || SEO_DEFAUT.description),
    motsCles: Array.isArray(r.motsCles) ? r.motsCles : [], verificationGoogle: r.verificationGoogle || "", ficheGoogle: r.ficheGoogle || "",
  };
}
/** Ce que la page publique applique (rien d'autre ne sort). */
async function publics() {
  const r = await lire();
  return { titre: r.titre, description: r.description };
}

/* ---------------- Bilan ---------------- */
const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MOTS_VIDES = ["de", "du", "des", "la", "le", "les", "au", "aux", "et", "en", "pour", "sur", "un", "une", "vos", "votre", "mes", "mon", "avec"];
const motsDe = (s) => sansAccents(s).split(/[^a-z0-9]+/).filter((m) => m.length > 2 && MOTS_VIDES.indexOf(m) === -1);
const pl = (n, un, plusieurs) => n + " " + (n > 1 ? plusieurs : un);

async function auditer() {
  const s = await lire();
  const [profil, apropos, posts, creations, videos, etudes, avis, formules] = await Promise.all([
    col("settings").findOne({ key: "profile" }), col("settings").findOne({ key: "apropos" }),
    col("posts").all(), col("creations").all(), col("videos").all(), col("etudes").all(), col("avis").all(), col("formules").all(),
  ]);
  const p = profil || {}, a = apropos || {};
  const points = [];
  const point = (groupe, cle, ok, titre, detail, action) => points.push({ groupe, cle, ok: !!ok, titre, detail, action: action || null });

  // Textes lus par Google
  const lt = s.titre.length, ld = s.description.length;
  point("Sur Google", "titre", lt >= 30 && lt <= 65, "Titre de la page",
    lt < 30 ? "Trop court (" + lt + " caractères) : visez 50 à 60, avec votre métier et votre ville."
      : lt > 65 ? "Trop long (" + lt + " caractères) : Google le coupe vers 60. Gardez l’essentiel au début." : lt + " caractères : bonne longueur.",
    { libelle: "Modifier", champ: "titre" });
  point("Sur Google", "description", ld >= 70 && ld <= 160, "Description sous le titre",
    ld < 70 ? "Trop courte (" + ld + " caractères) : visez 120 à 155, avec ce que vous proposez et une invitation à vous contacter."
      : ld > 160 ? "Trop longue (" + ld + " caractères) : Google coupe vers 155. Raccourcissez en gardant le message clé." : ld + " caractères : bonne longueur.",
    { libelle: "Modifier", champ: "description" });
  const texteGoogle = sansAccents(s.titre + " " + s.description);
  const ville = motsDe(p.localisation || "Libreville")[0] || "libreville";
  point("Sur Google", "ville", texteGoogle.indexOf(ville) !== -1, "Votre ville dans le titre ou la description",
    texteGoogle.indexOf(ville) !== -1 ? "On vous trouve en cherchant votre métier avec « " + (p.localisation || "Libreville").split(",")[0] + " »."
      : "Ajoutez « " + (p.localisation || "Libreville").split(",")[0] + " » : la plupart des recherches de prestataires se font avec une ville.",
    { libelle: "Modifier", champ: "titre" });
  const texteSite = sansAccents([s.titre, s.description, p.titre, p.bioAccroche, p.bio, a.introTitre, a.introLead]
    .concat(a.introParagraphes || [], (a.services || []).map((x) => (x.titre || "") + " " + (x.detail || "")),
      etudes.map((e) => (e.titre || "") + " " + (e.texte || "")), posts.map((x) => (x.texteGras || "") + " " + (x.texte || ""))).join(" "));
  const cles = s.motsCles.filter(Boolean);
  const absents = cles.filter((k) => !motsDe(k).every((m) => texteSite.indexOf(m) !== -1));
  point("Sur Google", "mots", cles.length >= 2 && !absents.length, "Vos mots-clés apparaissent sur le site",
    cles.length < 2 ? "Notez 2 à 5 recherches que vos clients tapent sur Google (ex : « community manager Libreville »)."
      : absents.length ? "Absents du site : " + absents.join(", ") + ". Glissez-les dans votre bio, vos services ou vos études de cas." : "Les " + cles.length + " mots-clés se retrouvent dans vos textes.",
    { libelle: "Modifier", champ: "motsCles" });

  // Profil
  const manque = [];
  if (!p.photo) manque.push("photo");
  if (String((p.bioAccroche || "") + " " + (p.bio || "")).trim().length < 80) manque.push("bio de 80 caractères au moins");
  if (!p.localisation) manque.push("ville");
  if (!p.telephone && !p.whatsapp) manque.push("téléphone");
  if (!p.email) manque.push("email");
  point("Votre profil", "profil", !manque.length, "Profil complet", manque.length ? "À compléter : " + manque.join(", ") + "." : "Photo, bio, ville et contacts sont renseignés.", { libelle: "Profil", lien: "profil" });
  const reseaux = (p.reseaux || []).filter((r) => r && /^https?:\/\//.test(r.url || ""));
  point("Votre profil", "reseaux", reseaux.length >= 2, "Réseaux sociaux reliés",
    reseaux.length >= 2 ? pl(reseaux.length, "réseau relié", "réseaux reliés") + " : Google fait le lien entre vos comptes et votre site."
      : "Reliez au moins 2 réseaux (Instagram, TikTok, LinkedIn…) dans votre profil.", { libelle: "Profil", lien: "profil" });

  // Contenu
  const riches = etudes.filter((e) => String(e.texte || "").length >= 400);
  point("Contenu", "etudes", riches.length >= 2, "Études de cas détaillées",
    pl(etudes.length, "étude de cas", "études de cas") + ", dont " + riches.length + " avec un texte détaillé (400 caractères ou plus). Visez 3 : c’est le contenu que Google comprend le mieux.",
    { libelle: "Études de cas", lien: "site/etudes" });
  point("Contenu", "contenus", posts.length >= 6 && creations.length + videos.length >= 4, "Portfolio fourni",
    pl(posts.length, "publication", "publications") + ", " + pl(creations.length + videos.length, "création ou vidéo", "créations et vidéos") + ". Visez au moins 6 publications et 4 créations.",
    { libelle: "Publications", lien: "site/posts" });
  const photos = posts.filter((x) => (x.type || "photo") === "photo" && (x.images || []).length);
  const sansAlt = photos.filter((x) => !String(x.alt || "").trim());
  point("Contenu", "alt", !sansAlt.length, "Images décrites",
    sansAlt.length ? pl(sansAlt.length, "publication photo n’a", "publications photo n’ont") + " pas de description d’image : Google ne voit pas les images, il lit leur description."
      : photos.length ? "Toutes vos photos ont une description." : "Pas encore de publication photo.", { libelle: "Publications", lien: "site/posts" });
  point("Contenu", "avis", avis.length >= 3, "Avis clients publiés",
    pl(avis.length, "avis publié", "avis publiés") + ". Visez 3 ou plus : demandez-les avec le lien d’avis depuis la fiche d’un client.", { libelle: "Clients", lien: "clients" });
  point("Contenu", "formules", formules.length >= 1, "Formules et tarifs", formules.length ? pl(formules.length, "formule affichée", "formules affichées") + "." : "Affichez au moins une formule : on cherche souvent « tarif community manager ».", { libelle: "Formules", lien: "site/formules" });

  // Présence sur Google
  point("Présence sur Google", "console", !!s.verificationGoogle, "Site déclaré à Google (Search Console)",
    s.verificationGoogle ? "Fichier de validation en place. Dans Search Console, suivez vos recherches et envoyez le plan du site : sitemap.xml."
      : "Déclarez votre site à Google pour suivre les recherches qui vous amènent des visiteurs (gratuit, 5 minutes).",
    { libelle: "Ouvrir Search Console", url: "https://search.google.com/search-console" });
  point("Présence sur Google", "fiche", !!s.ficheGoogle, "Fiche Google (Maps)",
    s.ficheGoogle ? "Fiche renseignée. Demandez à vos clients satisfaits un avis Google : c’est ce qui fait monter une fiche."
      : "Créez votre fiche gratuite : c’est elle qui apparaît sur Google Maps quand on cherche « community manager Libreville ».",
    { libelle: s.ficheGoogle ? "Ouvrir ma fiche" : "Créer ma fiche", url: s.ficheGoogle || "https://www.google.com/business/" });

  const ok = points.filter((x) => x.ok).length;
  return { score: Math.round((100 * ok) / points.length), ok, total: points.length, points };
}

/* ---------------- Routes (admin) ---------------- */
router.get("/seo", requireAdmin, route(async (_req, res) => {
  res.json({ reglages: await lire(), audit: await auditer(), site: (process.env.SITE_URL || "https://www.pauleackerman.com").replace(/\/+$/, "") });
}));
router.put("/seo", requireAdmin, route(async (req, res) => {
  const b = req.body || {};
  const x = {};
  if (b.titre !== undefined) {
    x.titre = o.texte(b.titre, 120).replace(/\s+/g, " ");
    if (x.titre.length < 10) throw o.erreur(400, "Titre trop court (10 caractères au moins)");
  }
  if (b.description !== undefined) {
    x.description = o.texte(b.description, 320).replace(/\s+/g, " ");
    if (x.description.length < 30) throw o.erreur(400, "Description trop courte (30 caractères au moins)");
  }
  if (b.motsCles !== undefined) {
    x.motsCles = (Array.isArray(b.motsCles) ? b.motsCles : String(b.motsCles).split(/[,\n;]/))
      .map((k) => o.texte(k, 60).replace(/\s+/g, " ")).filter(Boolean).slice(0, 8);
  }
  if (b.verificationGoogle !== undefined) {
    const v = o.texte(b.verificationGoogle, 300);
    const m = v.match(FICHIER_GOOGLE);
    if (v && !m) throw o.erreur(400, "Collez le nom du fichier donné par Google, par exemple google1a2b3c4d5e6f7a8b.html");
    x.verificationGoogle = m ? m[0].toLowerCase() : "";
  }
  if (b.ficheGoogle !== undefined) {
    const f = o.texte(b.ficheGoogle, 500);
    if (f && !/^https:\/\/[^\s<>"']+$/.test(f)) throw o.erreur(400, "Le lien de la fiche doit commencer par https://");
    x.ficheGoogle = f;
  }
  await o.majReglage(CLE, x);
  res.json({ reglages: await lire(), audit: await auditer() });
}));

/** Fichier de validation de Google Search Console : /google<code>.html */
async function fichierVerification(req, res) {
  const s = await lire();
  const nom = req.path.slice(1).toLowerCase();
  res.set("Cache-Control", "no-store");
  if (s.verificationGoogle && s.verificationGoogle === nom) return res.type("text/html").send("google-site-verification: " + s.verificationGoogle);
  res.status(404).type("text/plain").send("Introuvable");
}

module.exports = { router, lire, publics, auditer, fichierVerification, SEO_DEFAUT };
