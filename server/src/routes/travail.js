// Travail de community manager : calendrier éditorial, rapports mensuels,
// avis reçus par lien. Réservé à l'admin.
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const o = require("../outils");
const pj = require("../ai/pieces");

const router = express.Router();
router.use(requireAdmin);
const route = o.enveloppe("travail");

const ST_PLAN = ["idee", "creation", "a_valider", "valide", "publie"];
const RESEAUX = ["Instagram", "Facebook", "TikTok", "LinkedIn", "WhatsApp", "YouTube", "X", "Autre"];
const FORMATS = ["Post", "Carrousel", "Reel", "Story", "Vidéo", "Live", "Article", "Autre"];
const URL_MEDIA = /^(https:\/\/|\/api\/media\/|\/media\/)[^\s<>"']{1,1000}$/;

async function clientExiste(id) {
  return o.ID_RE.test(String(id || "")) && !!(await col("clients").get(String(id)));
}

/* =========================================================================
   Calendrier éditorial
========================================================================= */
function nettoyerPublication(b, partiel) {
  const x = {};
  if (b.date !== undefined) x.date = o.jour(b.date);
  if (b.heure !== undefined) x.heure = /^\d{2}:\d{2}$/.test(String(b.heure || "")) ? b.heure : "";
  if (b.reseau !== undefined) x.reseau = o.choix(b.reseau, RESEAUX, "Instagram");
  if (b.format !== undefined) x.format = o.choix(b.format, FORMATS, "Post");
  if (b.sujet !== undefined) x.sujet = o.texte(b.sujet, 300);
  if (b.legende !== undefined) x.legende = o.texte(b.legende, 5000);
  if (b.notes !== undefined) x.notes = o.texte(b.notes, 2000);
  if (b.statut !== undefined) x.statut = o.choix(b.statut, ST_PLAN, "idee");
  if (b.visuels !== undefined) x.visuels = (Array.isArray(b.visuels) ? b.visuels : []).map((u) => String(u || "").trim()).filter((u) => URL_MEDIA.test(u)).slice(0, 10);
  if ((!partiel || b.date !== undefined) && !x.date) throw o.erreur(400, "Choisissez la date de publication");
  return x;
}
async function publicationOu404(id) {
  const d = o.ID_RE.test(String(id || "")) ? await col("planning").get(id) : null;
  if (!d) throw o.erreur(404, "Publication introuvable");
  return d;
}

router.get("/planning", route(async (req, res) => {
  const q = req.query;
  const clients = await col("clients").all();
  const nom = (id) => (clients.find((x) => String(x._id) === id) || {}).nom || "Client supprimé";
  let l = await col("planning").all();
  if (o.JOUR_RE.test(q.du || "")) l = l.filter((p) => p.date >= q.du);
  if (o.JOUR_RE.test(q.au || "")) l = l.filter((p) => p.date <= q.au);
  if (q.client) l = l.filter((p) => p.clientId === String(q.client));
  if (q.statut) l = l.filter((p) => p.statut === q.statut);
  l.sort((a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")));
  res.json(l.slice(0, 1000).map((p) => Object.assign({}, p, { clientNom: nom(p.clientId) })));
}));
router.get("/planning/:id", route(async (req, res) => {
  const p = await publicationOu404(req.params.id);
  const cl = await col("clients").get(p.clientId);
  res.json(Object.assign({}, p, { clientNom: (cl && cl.nom) || "" }));
}));
router.post("/planning", route(async (req, res) => {
  const b = req.body || {};
  if (!(await clientExiste(b.clientId))) throw o.erreur(400, "Choisissez le client");
  const x = nettoyerPublication(b);
  res.status(201).json(await col("planning").insert(Object.assign({
    clientId: String(b.clientId), reseau: "Instagram", format: "Post", statut: "idee", sujet: "", legende: "", visuels: [], commentaires: [],
  }, x)));
}));
router.put("/planning/:id", route(async (req, res) => {
  const p = await publicationOu404(req.params.id);
  const x = nettoyerPublication(req.body || {}, true);
  if ((req.body || {}).clientId !== undefined) {
    if (!(await clientExiste(req.body.clientId))) throw o.erreur(400, "Client inconnu");
    x.clientId = String(req.body.clientId);
  }
  if (x.statut === "a_valider" && p.statut !== "a_valider") x.validation = null;
  res.json(await col("planning").update(p._id, x));
}));
router.delete("/planning/:id", route(async (req, res) => {
  const p = await publicationOu404(req.params.id);
  res.json({ ok: await col("planning").remove(p._id) });
}));
/** Réponse de Paule dans le fil de commentaires (visible par le client sur sa page). */
router.post("/planning/:id/commentaires", route(async (req, res) => {
  const p = await publicationOu404(req.params.id);
  const t = o.texte((req.body || {}).texte, 1500);
  if (!t) throw o.erreur(400, "Écrivez votre réponse");
  const commentaires = (p.commentaires || []).concat([{ auteur: "paule", texte: t, date: new Date().toISOString() }]).slice(-50);
  res.json(await col("planning").update(p._id, { commentaires }));
}));

/* =========================================================================
   Rapports mensuels
========================================================================= */
const liste = (v, n, m) => (Array.isArray(v) ? v : []).map((x) => o.texte(x, m || 400)).filter(Boolean).slice(0, n || 10);
function nettoyerRapport(b) {
  const x = {};
  if (b.titre !== undefined) x.titre = o.texte(b.titre, 200);
  if (b.bilan !== undefined) x.bilan = o.texte(b.bilan, 8000);
  ["pointsForts", "aAmeliorer", "recommandations"].forEach((k) => { if (b[k] !== undefined) x[k] = liste(b[k], 10); });
  if (b.chiffres !== undefined) {
    x.chiffres = (Array.isArray(b.chiffres) ? b.chiffres : []).slice(0, 20).map((c) => ({
      libelle: o.texte(c && c.libelle, 120), valeur: o.texte(c && c.valeur, 60), evolution: o.texte(c && c.evolution, 60),
    })).filter((c) => c.libelle && c.valeur);
  }
  return x;
}
async function rapportOu404(id) {
  const d = o.ID_RE.test(String(id || "")) ? await col("rapports").get(id) : null;
  if (!d) throw o.erreur(404, "Rapport introuvable");
  return d;
}
async function rapportComplet(r) {
  const [cl, planning, lien] = await Promise.all([col("clients").get(r.clientId), col("planning").all(), o.lienDe("rapport", r._id)]);
  const duMois = planning.filter((p) => p.clientId === r.clientId && String(p.date || "").slice(0, 7) === r.mois);
  return Object.assign({}, r, {
    clientNom: (cl && cl.nom) || "Client supprimé",
    lien: lien ? lien.jeton : "",
    publications: { prevues: duMois.length, publiees: duMois.filter((p) => p.statut === "publie").length },
  });
}

router.get("/rapports", route(async (req, res) => {
  let l = await col("rapports").all();
  if (req.query.client) l = l.filter((r) => r.clientId === String(req.query.client));
  res.json(l.sort((a, b) => String(b.mois).localeCompare(String(a.mois))));
}));
router.get("/rapports/:id", route(async (req, res) => res.json(await rapportComplet(await rapportOu404(req.params.id)))));
router.post("/rapports", route(async (req, res) => {
  const b = req.body || {};
  if (!(await clientExiste(b.clientId))) throw o.erreur(400, "Choisissez le client");
  const mois = o.MOIS_RE.test(String(b.mois || "")) ? b.mois : o.aujourdhui().slice(0, 7);
  const deja = (await col("rapports").all()).find((r) => r.clientId === String(b.clientId) && r.mois === mois);
  if (deja) return res.json(await rapportComplet(deja));
  const cl = await col("clients").get(String(b.clientId));
  const libelle = new Date(mois + "-15T12:00:00Z").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const r = await col("rapports").insert({
    clientId: String(b.clientId), mois, titre: "Bilan de " + libelle + " — " + cl.nom,
    chiffres: [], pointsForts: [], aAmeliorer: [], recommandations: [], bilan: "", pieces: [],
  });
  res.status(201).json(await rapportComplet(r));
}));
router.put("/rapports/:id", route(async (req, res) => {
  const r = await rapportOu404(req.params.id);
  const x = nettoyerRapport(req.body || {});
  if ((req.body || {}).pieces !== undefined) x.pieces = (await pj.attacher(req.body.pieces, "rapport:" + r._id)).pieces;
  res.json(await rapportComplet(await col("rapports").update(r._id, x)));
}));
router.delete("/rapports/:id", route(async (req, res) => {
  const r = await rapportOu404(req.params.id);
  await pj.supprimerPour("rapport:" + r._id);
  await o.supprimerLiens(r._id);
  res.json({ ok: await col("rapports").remove(r._id) });
}));
/** Léa lit les captures de statistiques et rédige le bilan. */
router.post("/rapports/:id/rediger", route(async (req, res) => {
  const r = await rapportOu404(req.params.id);
  const ids = (req.body || {}).pieces;
  const { pieces, docs } = await pj.attacher(ids !== undefined ? ids : (r.pieces || []).map((p) => p.id), "rapport:" + r._id);
  const complet = await rapportComplet(r);
  const cl = await col("clients").get(r.clientId);
  const planning = (await col("planning").all()).filter((p) => p.clientId === r.clientId && String(p.date || "").slice(0, 7) === r.mois);
  const redaction = await require("../ai/agents").redigerRapport({ rapport: complet, client: cl || {}, pieces, docs, planning, consignes: o.texte((req.body || {}).consignes, 1500) });
  const n = await col("rapports").update(r._id, Object.assign({ pieces }, nettoyerRapport(redaction), { redigeLe: new Date().toISOString(), modele: redaction.modele || "" }));
  res.json(await rapportComplet(n));
}));
router.post("/rapports/:id/partager", route(async (req, res) => {
  const r = await rapportOu404(req.params.id);
  res.json({ jeton: await o.lienPour("rapport", r._id, r.clientId, !!(req.body || {}).nouveau) });
}));

/* =========================================================================
   Avis reçus par lien (à valider avant publication sur le site)
========================================================================= */
router.get("/avis-recus", route(async (_req, res) => {
  const [l, clients] = await Promise.all([col("avis_recus").all(), col("clients").all()]);
  const ordre = { a_valider: 0, publie: 1, refuse: 2 };
  res.json(l.map((a) => Object.assign({}, a, { clientNom: (clients.find((c) => String(c._id) === a.clientId) || {}).nom || "" }))
    .sort((a, b) => (ordre[a.statut] - ordre[b.statut]) || String(b.createdAt).localeCompare(String(a.createdAt))));
}));
router.post("/avis-recus/:id/publier", route(async (req, res) => {
  const a = o.ID_RE.test(req.params.id) ? await col("avis_recus").get(req.params.id) : null;
  if (!a) throw o.erreur(404, "Avis introuvable");
  if (!a.autorise) throw o.erreur(409, "Ce client n’a pas autorisé la publication de son avis.");
  const b = req.body || {};
  const tous = await col("avis").all();
  const publie = await col("avis").insert({
    nom: o.texte(b.nom !== undefined ? b.nom : a.nom, 120),
    role: o.texte(b.role !== undefined ? b.role : a.role, 160),
    texte: o.texte(b.texte !== undefined ? b.texte : a.texte, 1500),
    ordre: tous.reduce((m, x) => Math.max(m, Number(x.ordre) || 0), 0) + 1,
  });
  res.json(await col("avis_recus").update(a._id, { statut: "publie", avisId: String(publie._id), publieLe: new Date().toISOString() }));
}));
router.post("/avis-recus/:id/refuser", route(async (req, res) => {
  const a = o.ID_RE.test(req.params.id) ? await col("avis_recus").get(req.params.id) : null;
  if (!a) throw o.erreur(404, "Avis introuvable");
  res.json(await col("avis_recus").update(a._id, { statut: "refuse" }));
}));
router.delete("/avis-recus/:id", route(async (req, res) => {
  if (!o.ID_RE.test(req.params.id)) throw o.erreur(404, "Introuvable");
  res.json({ ok: await col("avis_recus").remove(req.params.id) });
}));

module.exports = { router, ST_PLAN, RESEAUX, FORMATS };
