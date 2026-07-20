// Médias uploadés par l'admin — stockés DANS la base (base64), pas sur disque :
// sur Vercel le système de fichiers est éphémère, la base est le seul stockage
// durable. Servis sur GET /api/media/:id avec cache long + support des Range
// requests (nécessaire pour la lecture des vidéos sur iOS/Safari).
const express = require("express");
const multer = require("multer");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo — au-delà, la limite de document MongoDB (16 Mo) est dépassée en base64

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
});

const router = express.Router();

router.post("/", requireAdmin, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "Fichier trop lourd (10 Mo max). Pour une vidéo, compressez-la (CapCut → exporter en 720p) ou utilisez un lien Vimeo."
        : "Envoi impossible : " + err.message;
      return res.status(400).json({ erreur: msg });
    }
    if (!req.file) return res.status(400).json({ erreur: "Fichier manquant ou type non autorisé (jpg, png, webp, gif, mp4, webm)" });
    const doc = await col("media").insert({
      nom: req.file.originalname,
      type: req.file.mimetype,
      taille: req.file.size,
      data: req.file.buffer.toString("base64"),
    });
    res.status(201).json({ ok: true, url: "/api/media/" + doc._id, taille: doc.taille });
  });
});

// Liste (sans le contenu binaire) — pour la médiathèque de l'admin
router.get("/", requireAdmin, async (_req, res) => {
  const docs = await col("media").all();
  res.json(docs.map(({ _id, nom, type, taille, createdAt }) => ({
    _id, nom, type, taille, createdAt, url: "/api/media/" + _id,
  })));
});

router.get("/:id", async (req, res) => {
  const doc = await col("media").get(req.params.id);
  if (!doc) return res.status(404).json({ erreur: "Introuvable" });
  const buf = Buffer.from(doc.data, "base64");

  res.set("Content-Type", doc.type);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.set("Accept-Ranges", "bytes");

  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
    if (start >= buf.length) return res.status(416).set("Content-Range", `bytes */${buf.length}`).end();
    res.status(206);
    res.set("Content-Range", `bytes ${start}-${end}/${buf.length}`);
    return res.end(buf.subarray(start, end + 1));
  }
  res.end(buf);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const ok = await col("media").remove(req.params.id);
  if (!ok) return res.status(404).json({ erreur: "Introuvable" });
  res.json({ ok: true });
});

module.exports = { router };
