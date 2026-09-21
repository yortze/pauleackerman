// Portfolio Paule Ackerman — backend Express
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const { PORT, CLIENT_DIR } = require("./config");
const store = require("./store");
const { seed } = require("./seed");
const auth = require("./routes/auth");
const { contentRouter, COLLECTIONS } = require("./routes/content");
const messages = require("./routes/messages");
const media = require("./routes/media");
const { col } = require("./store");

/** Construit l'app Express (partagé entre le serveur classique et Vercel serverless). */
async function createApp() {
  await store.init();
  await seed();
  await auth.ensureAdmin();

  const app = express();
  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json({ limit: "200kb" }));

  // Documents uniques (profil, à propos) : lecture publique, écriture admin
  for (const key of ["profile", "apropos"]) {
    app.get("/api/" + key, async (_req, res) => {
      res.json((await col("settings").findOne({ key })) || {});
    });
    app.put("/api/" + key, require("./middleware/auth").requireAdmin, async (req, res) => {
      const doc = await col("settings").findOne({ key });
      const { _id, key: _k, hash, ...patch } = req.body || {};
      res.json(await col("settings").update(doc._id, patch));
    });
  }

  // Tout le contenu public en un seul appel (pour l'affichage du site)
  app.get("/api/all", async (_req, res) => {
    const out = {};
    for (const name of COLLECTIONS) {
      const docs = await col(name).all();
      docs.sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999));
      out[name] = docs;
    }
    out.profile = (await col("settings").findOne({ key: "profile" })) || {};
    out.apropos = (await col("settings").findOne({ key: "apropos" })) || {};
    res.json(out);
  });

  app.use("/api/auth", auth.router);
  app.use("/api/media", media.router);
  app.use("/api/content", contentRouter());
  app.use("/api/messages", messages.router);

  // Diagnostic : permet de vérifier après un déploiement que la base et
  // Cloudinary sont bien branchés, sans avoir à se connecter à l'admin.
  app.get("/api/health", (_req, res) => res.json({
    ok: true,
    store: store.kind,
    medias: require("./cloudinary").configured ? "cloudinary" : "base",
  }));

  // Site statique (index.html, admin.html, médias du dépôt)
  if (fs.existsSync(CLIENT_DIR)) {
    app.use(express.static(CLIENT_DIR, { maxAge: "1h", setHeaders: (res, p) => {
      if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      if (p.includes(`${path.sep}media${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }}));
    app.get("/admin", (_req, res) => res.sendFile(path.join(CLIENT_DIR, "admin.html")));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(CLIENT_DIR, "index.html"));
    });
  }

  return app;
}

module.exports = { createApp };

// Lancé directement (local, Render, VPS…) : serveur HTTP classique.
// Sur Vercel, api/index.js importe createApp sans écouter de port.
if (require.main === module) {
  createApp()
    .then((app) => app.listen(PORT, () => console.log(`[paule] API prête → http://localhost:${PORT}`)))
    .catch((e) => {
      console.error("Démarrage impossible :", e);
      process.exit(1);
    });
}
