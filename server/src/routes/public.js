// Routes publiques du site : réservation d'un appel découverte et
// statistiques de visite anonymes (aucune donnée personnelle stockée).
const express = require("express");
const crypto = require("crypto");
const { col } = require("../store");
const { JWT_SECRET } = require("../config");
const ag = require("../agenda");
const { notifier } = require("../notify");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function empreinte(req, prefixe) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "inconnue";
  return prefixe + crypto.createHmac("sha256", JWT_SECRET).update(ip).digest("hex").slice(0, 32);
}

/* ---------------- Réservation d'appel ---------------- */
router.get("/rdv/creneaux", async (_req, res) => {
  try { res.json(await ag.prochainsCreneaux(6)); }
  catch (e) { console.error(e); res.status(500).json({ erreur: "Agenda indisponible" }); }
});

router.post("/rdv/reserver", async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true }); // pot de miel
    const nom = String(b.nom || "").trim().slice(0, 120);
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
    const tel = String(b.telephone || "").replace(/[^\d+ ().-]/g, "").trim().slice(0, 30);
    if (!nom) return res.status(400).json({ erreur: "Indiquez votre nom" });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ erreur: "Email invalide" });

    const cfg = await ag.reglages();
    if (!cfg.actif) return res.status(409).json({ erreur: "La réservation en ligne est fermée pour le moment" });
    const d = ag.depuisLocal(b.debut);
    if (!d) return res.status(400).json({ erreur: "Créneau invalide" });
    const l = ag.versLocal(d);
    const libres = await ag.creneauxLibres(l.jour, cfg.dureeAppel, { public: true });
    if (libres.indexOf(l.heure) === -1) return res.status(409).json({ erreur: "Ce créneau vient d’être pris. Choisissez-en un autre." });

    // 3 réservations par jour et par connexion, au plus
    const cle = empreinte(req, "rdv:");
    const auj = ag.aujourdhui();
    const lim = await col("ratelimit_rdv").findOne({ cle });
    if (lim && lim.jour === auj && (lim.nb || 0) >= 3) return res.status(429).json({ erreur: "Trop de réservations aujourd’hui. Écrivez plutôt à Paule." });
    if (lim) await col("ratelimit_rdv").update(lim._id, lim.jour === auj ? { nb: (lim.nb || 0) + 1 } : { jour: auj, nb: 1, fenetre: new Date().toISOString() });
    else await col("ratelimit_rdv").insert({ cle, jour: auj, nb: 1, fenetre: new Date().toISOString() });

    const rdv = await col("rendezvous").insert({
      titre: "Appel découverte" + (b.besoin ? " — " + String(b.besoin).slice(0, 80) : ""),
      avec: nom, email, telephone: tel, debut: d.toISOString(), dureeMin: cfg.dureeAppel,
      lieu: cfg.lieuAppel || "", notes: String(b.objet || "").slice(0, 1000), statut: "a_confirmer", source: "site",
    });
    await notifier(`Nouveau rendez-vous : ${nom}, ${ag.libelleDate(d)}`,
      `${nom} (${email}${tel ? ", " + tel : ""}) a réservé un appel découverte le ${ag.libelleDate(d)} (${cfg.dureeAppel} min).` +
      (b.objet ? `\n\nSon projet : ${b.objet}` : "") + "\n\nPensez à confirmer le rendez-vous dans l'onglet Agenda.");
    res.status(201).json({ ok: true, id: rdv._id, quand: ag.libelleDate(d), dureeMin: cfg.dureeAppel, lieu: cfg.lieuAppel, debut: d.toISOString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: "La réservation n’a pas abouti. Réessayez." });
  }
});

/* ---------------- Statistiques anonymes ----------------
   Un document par jour (heure de Libreville) avec des compteurs agrégés :
   événements, sources de visite, appareils, heures, contenus vus, pays,
   liens de suivi. Aucune IP, aucun identifiant de visiteur n'est stocké. */
const EVENEMENTS = ["vue", "wa", "dm", "devis", "rdv", "story", "partage", "post", "reel"];
const SOURCES = ["instagram", "facebook", "whatsapp", "tiktok", "linkedin", "google", "recherche", "x", "youtube", "direct", "autre"];
const APPAREILS = ["mobile", "tablette", "ordinateur"];
const ID_RE = /^[\w-]{1,64}$/;
const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const MAX_CLES = 300; // garde-fou contre le gonflement d'un document

function incr(obj, cle) {
  if (!(cle in obj) && Object.keys(obj).length >= MAX_CLES) return;
  obj[cle] = Math.min((obj[cle] || 0) + 1, 1e7);
}

router.post("/track", async (req, res) => {
  try {
    const b = req.body || {};
    const e = String(b.e || "");
    if (EVENEMENTS.indexOf(e) === -1) return res.status(204).end();
    const key = ag.aujourdhui();
    const doc = (await col("stats").findOne({ key })) || {};
    const patch = {
      compte: Object.assign({}, doc.compte),
      sources: Object.assign({}, doc.sources),
      appareils: Object.assign({}, doc.appareils),
      heures: Object.assign({}, doc.heures),
      contenus: Object.assign({}, doc.contenus),
      pays: Object.assign({}, doc.pays),
      liens: Object.assign({}, doc.liens),
      nouveaux: doc.nouveaux || 0,
    };
    incr(patch.compte, e);
    if (e === "vue") {
      incr(patch.sources, SOURCES.indexOf(b.src) !== -1 ? b.src : "autre");
      if (APPAREILS.indexOf(b.dev) !== -1) incr(patch.appareils, b.dev);
      incr(patch.heures, String(new Date(Date.now() + 3600000).getUTCHours()));
      const pays = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
      if (/^[A-Z]{2}$/.test(pays)) incr(patch.pays, pays);
      if (b.nouveau === true) patch.nouveaux++;
      if (typeof b.lien === "string" && SLUG_RE.test(b.lien)) incr(patch.liens, b.lien);
    }
    if ((e === "story" || e === "post" || e === "partage") && typeof b.id === "string" && ID_RE.test(b.id)) {
      incr(patch.contenus, (e === "story" ? "story:" : "post:") + b.id);
    }
    if (doc._id) await col("stats").update(doc._id, patch);
    else await col("stats").insert(Object.assign({ key }, patch));
  } catch (err) {
    console.warn("[track]", err.message);
  }
  res.status(204).end();
});

module.exports = { router };
