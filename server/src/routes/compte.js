// Compte de Paule : sauvegarde de ses données (export JSON) et notifications
// sur ses appareils. Réservé à l'admin.
const express = require("express");
const zlib = require("zlib");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const o = require("../outils");
const push = require("../push");
const { COLLECTIONS } = require("./content");

const router = express.Router();
const route = o.enveloppe("compte");

const A_SAUVEGARDER = COLLECTIONS.concat([
  "messages", "prospects", "rendezvous", "clients", "documents", "couts", "planning", "rapports", "avis_recus",
  "equipe", "debriefs", "notes", "memoire", "raccourcis", "modeles", "evenements", "stats", "pieces", "media", "settings",
]);
// Jamais dans une sauvegarde : mot de passe, double authentification, clés privées.
// Les jetons des liens clients (collection « liens ») et les abonnements aux notifications non plus.
const REGLAGES_EXCLUS = ["admin", "push_vapid"];
const CHAMPS_EXCLUS = { pieces: ["data", "apercu"], media: ["data"] };

router.get("/export", requireAdmin, route(async (req, res) => {
  const collections = {};
  for (const nom of A_SAUVEGARDER) {
    let docs = await col(nom).all();
    if (nom === "settings") docs = docs.filter((d) => REGLAGES_EXCLUS.indexOf(d.key) === -1);
    const exclus = CHAMPS_EXCLUS[nom];
    if (exclus) docs = docs.map((d) => { const x = Object.assign({}, d); exclus.forEach((k) => delete x[k]); return x; });
    collections[nom] = docs;
  }
  const corps = JSON.stringify({
    format: "sauvegarde-pauleackerman", version: 1, exporteLe: new Date().toISOString(),
    note: "Sans mot de passe, double authentification, fichiers joints ni jetons des liens clients.",
    collections,
  }, null, 1);
  const nomFichier = "sauvegarde-espace-pro-" + o.aujourdhui() + ".json";
  res.set({ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="' + nomFichier + '"', "Cache-Control": "no-store" });
  // Compressé : la réponse d'une fonction Vercel est limitée à 4,5 Mo
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
    res.set({ "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
    return res.send(zlib.gzipSync(Buffer.from(corps, "utf8")));
  }
  res.send(corps);
}));

/* ---------------- Notifications sur les appareils (Web Push) ---------------- */
router.get("/notifications", requireAdmin, route(async (_req, res) => {
  const [k, abonnes, preferences] = await Promise.all([push.cles(), col("push_abonnements").all(), push.preferences()]);
  res.json({
    clePublique: k.publicKey, types: push.TYPES, preferences,
    appareils: abonnes.map((a) => ({ id: String(a._id), appareil: a.appareil, depuis: a.createdAt || "", endpoint: a.endpoint })),
  });
}));
router.post("/notifications/abonnement", requireAdmin, route(async (req, res) => {
  const b = req.body || {};
  await push.abonner(b.abonnement, b.appareil);
  res.json({ ok: true });
}));
router.post("/notifications/desabonnement", requireAdmin, route(async (req, res) => {
  const b = req.body || {};
  let a = null;
  if (typeof b.id === "string" && o.ID_RE.test(b.id)) a = await col("push_abonnements").get(b.id);
  else if (typeof b.endpoint === "string") a = await col("push_abonnements").findOne({ endpoint: b.endpoint });
  if (a) await col("push_abonnements").remove(a._id);
  res.json({ ok: true });
}));
router.put("/notifications/preferences", requireAdmin, route(async (req, res) => {
  const t = (req.body || {}).types || {};
  const actuel = await o.reglage("push_prefs", { types: {} });
  const types = Object.assign({}, actuel.types || {});
  Object.keys(push.TYPES).forEach((k) => { if (t[k] !== undefined) types[k] = !!t[k]; });
  await o.majReglage("push_prefs", { types });
  res.json({ preferences: await push.preferences() });
}));
router.post("/notifications/test", requireAdmin, route(async (_req, res) => {
  const n = await push.envoyer({ titre: "Notifications activées", corps: "Vous serez prévenue ici des nouvelles demandes, des rendez-vous et des retours de vos clients.", lien: "reglages" });
  if (!n) throw o.erreur(400, "Aucun appareil n’a reçu la notification : réactivez-les sur cet appareil");
  res.json({ ok: true, appareils: n });
}));

module.exports = { router };
