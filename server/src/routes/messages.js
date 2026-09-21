// Messages envoyés depuis la boîte DM du site — lus par Paule dans l'admin.
//
// Le rate-limit est stocké en base et non en mémoire : sur Vercel chaque
// requête peut tomber sur une instance différente (et les instances sont
// recyclées), un compteur en RAM ne protège donc de rien.
const express = require("express");
const crypto = require("crypto");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const { JWT_SECRET } = require("../config");

const router = express.Router();

const DELAI_ENTRE_MESSAGES = 20_000;   // 20 s entre deux envois d'une même IP
const MAX_PAR_JOUR = 5;                 // par IP
const MAX_GLOBAL_PAR_JOUR = 80;         // garde-fou en cas de flood distribué
const MAX_LONGUEUR = 4000;
const MIN_LONGUEUR = 2;
const RETENTION_LIMITES = 48 * 3600_000; // purge des compteurs au-delà de 48 h

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Empreinte de l'IP : sert de clé de rate-limit sans stocker l'IP en clair. */
function empreinte(req) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "inconnue";
  return crypto.createHmac("sha256", JWT_SECRET).update(ip).digest("hex").slice(0, 32);
}

/** Compte les liens d'un message — au-delà de 3, on marque comme spam probable. */
function compteLiens(txt) {
  return (String(txt).match(/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|ru|xyz|top|info|biz|online)\b/gi) || []).length;
}

/**
 * Vérifie et met à jour les compteurs d'envoi. Renvoie null si l'envoi est
 * permis, sinon { code, erreur }.
 */
async function verifieLimites(cle) {
  const maintenant = Date.now();
  const limites = col("ratelimit");
  const tous = await limites.all();

  // Purge opportuniste des vieux compteurs
  for (const d of tous) {
    if (maintenant - new Date(d.fenetre || 0).getTime() > RETENTION_LIMITES) await limites.remove(d._id);
  }

  const actifs = tous.filter((d) => maintenant - new Date(d.fenetre || 0).getTime() <= 24 * 3600_000);
  const total = actifs.reduce((n, d) => n + (d.nb || 0), 0);
  if (total >= MAX_GLOBAL_PAR_JOUR) {
    return { code: 429, erreur: "La messagerie reçoit trop de demandes aujourd'hui. Réessayez demain ou écrivez par email." };
  }

  const doc = tous.find((d) => d.cle === cle);
  if (!doc) {
    await limites.insert({ cle, nb: 1, fenetre: new Date(maintenant).toISOString(), dernier: maintenant });
    return null;
  }

  if (maintenant - (doc.dernier || 0) < DELAI_ENTRE_MESSAGES) {
    return { code: 429, erreur: "Doucement — attendez quelques secondes avant de renvoyer un message." };
  }

  const debutFenetre = new Date(doc.fenetre || 0).getTime();
  if (maintenant - debutFenetre > 24 * 3600_000) {
    await limites.update(doc._id, { nb: 1, fenetre: new Date(maintenant).toISOString(), dernier: maintenant });
    return null;
  }
  if ((doc.nb || 0) >= MAX_PAR_JOUR) {
    return { code: 429, erreur: "Vous avez déjà envoyé plusieurs messages aujourd'hui. Paule vous répond très vite — sinon, écrivez-lui par email." };
  }
  await limites.update(doc._id, { nb: (doc.nb || 0) + 1, dernier: maintenant });
  return null;
}

/* ============================================================================
   Envoi public
============================================================================ */
router.post("/", async (req, res) => {
  const { nom, email, message, website, ouvertureTs } = req.body || {};

  // Honeypot : le champ "website" est invisible pour les humains
  if (website) return res.status(201).json({ ok: true }); // on fait semblant

  // Formulaire rempli en moins de 2 s : robot. On fait semblant aussi.
  const delaiSaisie = Number(ouvertureTs) ? Date.now() - Number(ouvertureTs) : null;
  if (delaiSaisie !== null && delaiSaisie >= 0 && delaiSaisie < 2000) {
    return res.status(201).json({ ok: true });
  }

  const txt = String(message || "").trim();
  if (txt.length < MIN_LONGUEUR) return res.status(400).json({ erreur: "Le message est vide" });
  if (txt.length > MAX_LONGUEUR) return res.status(400).json({ erreur: `Message trop long (${MAX_LONGUEUR} caractères max)` });

  const mail = String(email || "").trim().toLowerCase();
  if (!mail) return res.status(400).json({ erreur: "Laissez votre email pour que Paule puisse vous répondre" });
  if (!EMAIL_RE.test(mail) || mail.length > 200) return res.status(400).json({ erreur: "Email invalide" });

  const limite = await verifieLimites(empreinte(req));
  if (limite) return res.status(limite.code).json({ erreur: limite.erreur });

  const doc = await col("messages").insert({
    nom: String(nom || "").trim().slice(0, 120) || "Anonyme",
    email: mail,
    message: txt,
    lu: false,
    spam: compteLiens(txt) > 3,
  });
  res.status(201).json({ ok: true, id: doc._id });
});

/* ============================================================================
   Lecture et gestion (admin)
============================================================================ */
// GET /api/messages?filtre=tous|nonlus|lus|spam&q=…&page=1&limite=20
router.get("/", requireAdmin, async (req, res) => {
  const { filtre = "tous", q = "" } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 20));

  let docs = await col("messages").all();
  docs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const nonLus = docs.filter((d) => !d.lu).length;
  const total = docs.length;

  if (filtre === "nonlus") docs = docs.filter((d) => !d.lu);
  else if (filtre === "lus") docs = docs.filter((d) => d.lu);
  else if (filtre === "spam") docs = docs.filter((d) => d.spam);

  const recherche = String(q).trim().toLowerCase();
  if (recherche) {
    docs = docs.filter((d) =>
      [d.nom, d.email, d.message].some((v) => String(v || "").toLowerCase().includes(recherche)));
  }

  const filtres = docs.length;
  res.json({
    items: docs.slice((page - 1) * limite, page * limite),
    page,
    limite,
    filtres,
    total,
    nonLus,
    pages: Math.max(1, Math.ceil(filtres / limite)),
  });
});

// Marquer lu / non lu
router.put("/:id", requireAdmin, async (req, res) => {
  const lu = !!(req.body && req.body.lu);
  const doc = await col("messages").update(req.params.id, { lu });
  if (!doc) return res.status(404).json({ erreur: "Introuvable" });
  res.json(doc);
});

// Compat : ancienne route utilisée par la version précédente de l'admin
router.put("/:id/lu", requireAdmin, async (req, res) => {
  const doc = await col("messages").update(req.params.id, { lu: true });
  if (!doc) return res.status(404).json({ erreur: "Introuvable" });
  res.json(doc);
});

// Tout marquer comme lu
router.post("/tout-lu", requireAdmin, async (_req, res) => {
  const docs = await col("messages").all();
  let n = 0;
  for (const d of docs) if (!d.lu) { await col("messages").update(d._id, { lu: true }); n++; }
  res.json({ ok: true, modifies: n });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const ok = await col("messages").remove(req.params.id);
  if (!ok) return res.status(404).json({ erreur: "Introuvable" });
  res.json({ ok: true });
});

module.exports = { router };
