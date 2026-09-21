// Médias importés depuis l'admin.
//
// Deux modes, choisis automatiquement :
//
//  1. Cloudinary (dès que les clés sont dans les variables d'environnement) —
//     le navigateur envoie le fichier DIRECTEMENT à Cloudinary avec une
//     signature demandée au serveur. Rien ne transite par la fonction Vercel
//     (donc plus de plafond ~4,5 Mo), la base ne garde qu'une fiche + l'URL.
//
//  2. Repli sans Cloudinary (dev local) — le fichier est stocké en base64 dans
//     la base et servi sur GET /api/media/:id, avec cache long et support des
//     Range requests (nécessaire pour lire les vidéos sur iOS/Safari).
const express = require("express");
const multer = require("multer");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const cloudinary = require("../cloudinary");
const { MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, MAX_DB_SIZE } = require("../config");

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4", "video/webm", "video/quicktime"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DB_SIZE },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
});

const router = express.Router();

/* ----------------------------------------------------------------------------
   Configuration — l'admin s'en sert pour savoir quel mode utiliser et quelles
   tailles refuser avant même de lancer l'envoi.
---------------------------------------------------------------------------- */
router.get("/config", requireAdmin, (_req, res) => {
  res.json({
    cloudinary: cloudinary.configured,
    cloudName: cloudinary.configured ? cloudinary.cloudName : "",
    maxImage: cloudinary.configured ? MAX_IMAGE_SIZE : MAX_DB_SIZE,
    maxVideo: cloudinary.configured ? MAX_VIDEO_SIZE : MAX_DB_SIZE,
    typesAutorises: ALLOWED,
  });
});

/* ----------------------------------------------------------------------------
   Mode Cloudinary : signature puis enregistrement de la fiche en base
---------------------------------------------------------------------------- */
router.post("/signature", requireAdmin, (req, res) => {
  if (!cloudinary.configured) {
    return res.status(409).json({ erreur: "Cloudinary n'est pas configuré sur ce serveur" });
  }
  const type = String((req.body && req.body.type) || "");
  if (type && !ALLOWED.includes(type)) {
    return res.status(400).json({ erreur: "Type de fichier non autorisé (jpg, png, webp, gif, avif, mp4, webm, mov)" });
  }
  res.json(cloudinary.uploadSignature(type));
});

// Appelé par l'admin juste après un upload réussi vers Cloudinary : on vérifie
// la signature renvoyée par Cloudinary avant d'inscrire quoi que ce soit.
router.post("/register", requireAdmin, async (req, res) => {
  const r = req.body || {};
  if (!cloudinary.configured) return res.status(409).json({ erreur: "Cloudinary n'est pas configuré" });
  if (!cloudinary.verifyUpload(r)) {
    return res.status(400).json({ erreur: "Réponse Cloudinary invalide — envoi refusé" });
  }
  if (!String(r.public_id).startsWith(cloudinary.folder + "/")) {
    return res.status(400).json({ erreur: "Média hors du dossier du site — envoi refusé" });
  }
  const estVideo = r.resource_type === "video";
  const url = estVideo ? r.secure_url : cloudinary.optimized(r.secure_url);
  const doc = await col("media").insert({
    provider: "cloudinary",
    nom: r.original_filename ? r.original_filename + "." + r.format : r.public_id,
    type: (estVideo ? "video/" : "image/") + (r.format || "jpeg"),
    taille: r.bytes || 0,
    url,
    publicId: r.public_id,
    resourceType: r.resource_type,
    largeur: r.width || null,
    hauteur: r.height || null,
    duree: r.duration || null,
  });
  res.status(201).json({ ok: true, url, taille: doc.taille, _id: doc._id });
});

/* ----------------------------------------------------------------------------
   Mode repli : upload classique, stocké en base
---------------------------------------------------------------------------- */
router.post("/", requireAdmin, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? `Fichier trop lourd (${Math.round(MAX_DB_SIZE / 1024 / 1024)} Mo max sans Cloudinary). Compressez la vidéo (CapCut → 720p) ou configurez Cloudinary.`
        : "Envoi impossible : " + err.message;
      return res.status(400).json({ erreur: msg });
    }
    if (!req.file) return res.status(400).json({ erreur: "Fichier manquant ou type non autorisé (jpg, png, webp, gif, avif, mp4, webm, mov)" });
    const doc = await col("media").insert({
      provider: "db",
      nom: req.file.originalname,
      type: req.file.mimetype,
      taille: req.file.size,
      data: req.file.buffer.toString("base64"),
    });
    res.status(201).json({ ok: true, url: "/api/media/" + doc._id, taille: doc.taille });
  });
});

/* ----------------------------------------------------------------------------
   Médiathèque et service des fichiers
---------------------------------------------------------------------------- */
// Liste (sans le contenu binaire) — pour la médiathèque de l'admin
router.get("/", requireAdmin, async (_req, res) => {
  const docs = await col("media").all();
  res.json(docs.map(({ _id, nom, type, taille, createdAt, provider, url }) => ({
    _id, nom, type, taille, createdAt,
    provider: provider || "db",
    url: url || "/api/media/" + _id,
  })));
});

router.get("/:id", async (req, res) => {
  const doc = await col("media").get(req.params.id);
  if (!doc) return res.status(404).json({ erreur: "Introuvable" });

  // Média Cloudinary : on renvoie vers l'URL du CDN (anciens liens toujours valides)
  if (doc.url && !doc.data) return res.redirect(302, doc.url);

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
  const doc = await col("media").get(req.params.id);
  if (!doc) return res.status(404).json({ erreur: "Introuvable" });
  if (doc.publicId) await cloudinary.destroy(doc.publicId, doc.resourceType);
  await col("media").remove(req.params.id);
  res.json({ ok: true });
});

module.exports = { router };
