// Messages envoyés depuis la boîte DM du site — lus par Paule dans l'admin.
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Rate-limit naïf : 1 message / 20 s / IP
const lastPost = new Map();

router.post("/", async (req, res) => {
  const { nom, email, message, website } = req.body || {};

  // Honeypot anti-spam : le champ "website" est invisible pour les humains
  if (website) return res.status(201).json({ ok: true }); // on fait semblant

  const last = lastPost.get(req.ip) || 0;
  if (Date.now() - last < 20_000) {
    return res.status(429).json({ erreur: "Doucement — attendez quelques secondes" });
  }

  if (!message || !String(message).trim()) {
    return res.status(400).json({ erreur: "Le message est vide" });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erreur: "Email invalide" });
  }
  if (String(message).length > 4000) {
    return res.status(400).json({ erreur: "Message trop long (4000 caractères max)" });
  }

  lastPost.set(req.ip, Date.now());
  const doc = await col("messages").insert({
    nom: String(nom || "Anonyme").slice(0, 120),
    email: String(email || "").slice(0, 200),
    message: String(message).slice(0, 4000),
    lu: false,
  });
  res.status(201).json({ ok: true, id: doc._id });
});

router.get("/", requireAdmin, async (_req, res) => {
  const docs = await col("messages").all();
  docs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json(docs);
});

router.put("/:id/lu", requireAdmin, async (req, res) => {
  const doc = await col("messages").update(req.params.id, { lu: true });
  if (!doc) return res.status(404).json({ erreur: "Introuvable" });
  res.json(doc);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const ok = await col("messages").remove(req.params.id);
  if (!ok) return res.status(404).json({ erreur: "Introuvable" });
  res.json({ ok: true });
});

module.exports = { router };
