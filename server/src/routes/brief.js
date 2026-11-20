// Brief du matin : réglages et aperçu (admin), déclenchement quotidien (tâche planifiée Vercel).
const crypto = require("crypto");
const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const o = require("../outils");
const brief = require("../brief");

const route = o.enveloppe("brief");

/* ---------------- Admin ---------------- */
const router = express.Router();
router.use("/brief", requireAdmin);
router.get("/brief", route(async (_req, res) => {
  res.json({ reglages: await brief.reglages(), emailConfigure: brief.emailConfigure(), cronProtege: !!process.env.CRON_SECRET });
}));
router.get("/brief/apercu", route(async (_req, res) => {
  const b = await brief.composer();
  res.json({ sujet: b.sujet, html: b.html, vide: b.vide, sections: b.sections.length });
}));
router.put("/brief", route(async (req, res) => {
  const b = req.body || {};
  const x = {};
  if (b.actif !== undefined) x.actif = !!b.actif;
  if (b.siVide !== undefined) x.siVide = !!b.siVide;
  await o.majReglage(brief.CLE, x);
  res.json(await brief.reglages());
}));
router.post("/brief/test", route(async (_req, res) => res.json(await brief.envoyerTest())));

/* ---------------- Tâche planifiée (Vercel Cron) ----------------
   Vercel appelle GET /api/cron/brief chaque matin. Avec CRON_SECRET défini,
   Vercel envoie « Authorization: Bearer <CRON_SECRET> » et rien d'autre n'est accepté.
   Sans secret, seul l'agent de Vercel est accepté, et l'envoi reste limité à un par jour. */
const cron = express.Router();
function egal(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function autorise(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) return egal(req.headers.authorization || "", "Bearer " + secret);
  return /^vercel-cron\//.test(String(req.headers["user-agent"] || ""));
}
cron.get("/brief", route(async (req, res) => {
  if (!autorise(req)) throw o.erreur(401, "Non autorisé");
  res.set("Cache-Control", "no-store");
  res.json(await brief.envoyerDuJour());
}));

module.exports = { router, cron };
