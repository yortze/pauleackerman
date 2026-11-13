// Audience du site : visites, sources, appareils, heures, contenus, pays,
// entonnoir de conversion et liens de suivi. Données anonymes et agrégées.
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const ag = require("../agenda");

const router = express.Router();
router.use(requireAdmin);

const enveloppe = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (!e.status) console.error("[audience]", e);
  res.status(e.status || 500).json({ erreur: e.status ? e.message : "Erreur interne : " + e.message });
});

const LIB_SOURCES = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", tiktok: "TikTok", linkedin: "LinkedIn",
  google: "Google", recherche: "Autres moteurs", x: "X (Twitter)", youtube: "YouTube", direct: "Accès direct", autre: "Autres sites",
};
const LIB_APPAREILS = { mobile: "Mobile", tablette: "Tablette", ordinateur: "Ordinateur" };
const LIB_STORIES = {
  services: "Story à la une « Services »", avis: "Story à la une « Avis »", projets: "Story à la une « Projets »",
  parcours: "Story à la une « Parcours »", certifs: "Story à la une « Certifs »", contact: "Story à la une « Contact »",
};

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
  return proto + "://" + req.get("host");
}
function somme(docs, champ) {
  const o = {};
  docs.forEach((d) => Object.entries(d[champ] || {}).forEach(([k, v]) => { o[k] = (o[k] || 0) + (Number(v) || 0); }));
  return o;
}
function classer(obj, libelles, max) {
  return Object.entries(obj).map(([cle, n]) => ({ cle, libelle: (libelles && libelles[cle]) || cle, n }))
    .sort((a, b) => b.n - a.n).slice(0, max || 20);
}
const court = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

async function titresContenus() {
  const t = {};
  (await col("posts").all()).forEach((p) => { t[String(p._id)] = court(p.texteGras || p.partageTexte || p.texte || "Publication", 70); });
  (await col("creations").all()).forEach((c) => { t["c-" + c._id] = court(c.titre || "Création", 70); });
  (await col("videos").all()).forEach((v) => { t["v-" + v._id] = court(v.titre || "Vidéo", 70); });
  (await col("etudes").all()).forEach((e) => { t["e-" + e._id] = court(e.titre || "Étude de cas", 70); });
  return t;
}

router.get("/audience", enveloppe(async (req, res) => {
  const n = [7, 30, 90].indexOf(Number(req.query.jours)) !== -1 ? Number(req.query.jours) : 30;
  const fin = ag.aujourdhui();
  const debut = ag.ajouterJours(fin, -(n - 1));
  const finPrec = ag.ajouterJours(debut, -1);
  const debutPrec = ag.ajouterJours(debut, -n);
  const entre = (j, a, b) => j >= a && j <= b;
  const jourDe = (d) => ag.versLocal(d).jour;

  const stats = await col("stats").all();
  const periode = stats.filter((s) => entre(s.key, debut, fin));
  const prec = stats.filter((s) => entre(s.key, debutPrec, finPrec));
  const messages = (await col("messages").all()).filter((m) => !m.spam);
  const rdvSite = (await col("rendezvous").all()).filter((r) => r.source === "site");

  const totaux = (docs, a, b) => {
    const c = somme(docs, "compte");
    return {
      visites: c.vue || 0, nouveaux: docs.reduce((s, d) => s + (d.nouveaux || 0), 0),
      conversations: c.dm || 0, demandes: messages.filter((m) => entre(jourDe(m.createdAt), a, b)).length,
      rdv: rdvSite.filter((r) => entre(jourDe(r.createdAt), a, b)).length,
      wa: c.wa || 0, stories: c.story || 0, contenus: c.post || 0, partages: c.partage || 0,
    };
  };

  const parJour = {};
  periode.forEach((s) => { parJour[s.key] = s; });
  const serie = [];
  for (let i = 0; i < n; i++) {
    const j = ag.ajouterJours(debut, i);
    const c = (parJour[j] && parJour[j].compte) || {};
    serie.push({
      jour: j, visites: c.vue || 0, conversations: c.dm || 0, wa: c.wa || 0,
      demandes: messages.filter((m) => jourDe(m.createdAt) === j).length,
      rdv: rdvSite.filter((r) => jourDe(r.createdAt) === j).length,
    });
  }

  const heures = [];
  for (let h = 0; h < 24; h++) heures.push(periode.reduce((s, d) => s + (Number((d.heures || {})[String(h)]) || 0), 0));

  const titres = await titresContenus();
  const contenus = classer(somme(periode, "contenus"), null, 10).map((x) => {
    const i = x.cle.indexOf(":");
    const type = x.cle.slice(0, i), id = x.cle.slice(i + 1);
    return { type, id, titre: type === "story" ? (LIB_STORIES[id] || "Story à la une") : (titres[id] || "Publication supprimée"), n: x.n };
  });

  const liensCfg = ((await col("settings").findOne({ key: "liens" })) || {}).liste || [];
  const liensN = somme(periode, "liens");
  const liens = liensCfg.map((l) => Object.assign({}, l, { n: liensN[l.slug] || 0 }));

  res.json({
    periode: { jours: n, debut, fin, debutPrec, finPrec },
    totaux: totaux(periode, debut, fin),
    precedent: totaux(prec, debutPrec, finPrec),
    serie,
    sources: classer(somme(periode, "sources"), LIB_SOURCES),
    appareils: classer(somme(periode, "appareils"), LIB_APPAREILS),
    pays: classer(somme(periode, "pays"), null, 12),
    heures,
    contenus,
    liens,
    siteUrl: siteUrl(req),
  });
}));

/* ---------------- Liens de suivi ---------------- */
function slugifier(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
async function lireLiens() {
  const doc = await col("settings").findOne({ key: "liens" });
  return { doc, liste: (doc && doc.liste) || [] };
}
router.get("/liens", enveloppe(async (req, res) => {
  const { liste } = await lireLiens();
  res.json({ liste, siteUrl: siteUrl(req) });
}));
router.post("/liens", enveloppe(async (req, res) => {
  const nom = String((req.body && req.body.nom) || "").trim().slice(0, 80);
  if (!nom) return res.status(400).json({ erreur: "Donnez un nom au lien (ex : Bio Instagram)" });
  const { doc, liste } = await lireLiens();
  let slug = slugifier((req.body && req.body.slug) || nom) || "lien";
  const base = slug;
  for (let i = 2; liste.some((l) => l.slug === slug); i++) slug = (base.slice(0, 36) + "-" + i);
  if (liste.length >= 50) return res.status(400).json({ erreur: "50 liens maximum" });
  const nouvelle = liste.concat([{ slug, nom, cree: new Date().toISOString() }]);
  if (doc) await col("settings").update(doc._id, { liste: nouvelle });
  else await col("settings").insert({ key: "liens", liste: nouvelle });
  res.status(201).json({ slug, nom, url: siteUrl(req) + "/?src=" + slug });
}));
router.delete("/liens/:slug", enveloppe(async (req, res) => {
  const { doc, liste } = await lireLiens();
  if (doc) await col("settings").update(doc._id, { liste: liste.filter((l) => l.slug !== req.params.slug) });
  res.json({ ok: true });
}));

module.exports = { router };
