// CRUD générique pour les collections de contenu.
// Lecture publique, écriture réservée à l'admin.
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");

const COLLECTIONS = ["posts", "creations", "videos", "etudes", "registre"];

function contentRouter() {
  const router = express.Router();

  router.param("collection", (req, res, next, name) => {
    if (!COLLECTIONS.includes(name)) return res.status(404).json({ erreur: "Collection inconnue" });
    req.collection = col(name);
    next();
  });

  router.get("/:collection", async (req, res) => {
    const docs = await req.collection.all();
    docs.sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999));
    res.json(docs);
  });

  router.get("/:collection/:id", async (req, res) => {
    const doc = await req.collection.get(req.params.id);
    if (!doc) return res.status(404).json({ erreur: "Introuvable" });
    res.json(doc);
  });

  router.post("/:collection", requireAdmin, async (req, res) => {
    if (!req.body || typeof req.body !== "object") return res.status(400).json({ erreur: "Corps invalide" });
    res.status(201).json(await req.collection.insert(req.body));
  });

  router.put("/:collection/:id", requireAdmin, async (req, res) => {
    const doc = await req.collection.update(req.params.id, req.body || {});
    if (!doc) return res.status(404).json({ erreur: "Introuvable" });
    res.json(doc);
  });

  router.delete("/:collection/:id", requireAdmin, async (req, res) => {
    const ok = await req.collection.remove(req.params.id);
    if (!ok) return res.status(404).json({ erreur: "Introuvable" });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { contentRouter, COLLECTIONS };
