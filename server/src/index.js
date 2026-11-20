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
const seo = require("./routes/seo");
const { col } = require("./store");

/** Construit l'app Express (partagé entre le serveur classique et Vercel serverless). */
async function createApp() {
  await store.init();
  await seed();
  await auth.ensureAdmin();

  const app = express();
  app.set("trust proxy", true);
  app.use(cors());
  // Les pièces jointes de l'équipe IA ont leur propre limite (routes/equipe.js), lue après la connexion
  const json = express.json({ limit: "200kb" });
  app.use((req, res, next) => (req.path.indexOf("/api/crm/pieces") === 0 ? next() : json(req, res, next)));

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
    // Titre et description réglés dans Référencement (appliqués par la page)
    try { out.seo = await seo.publics(); } catch (e) { out.seo = null; }
    res.json(out);
  });

  app.use("/api/auth", auth.router);
  app.use("/api/media", media.router);
  app.use("/api/content", contentRouter());
  app.use("/api/messages", messages.router);
  app.use("/api/crm", require("./routes/crm").router);
  app.use("/api/crm", require("./routes/equipe").router);
  app.use("/api/crm", require("./routes/audience").router);
  app.use("/api/crm", require("./routes/clients").router);
  app.use("/api/crm", require("./routes/travail").router);
  app.use("/api/crm", require("./routes/organisation").router);
  app.use("/api/crm", require("./routes/brief").router);
  app.use("/api/crm", require("./routes/compte").router);
  app.use("/api/crm", seo.router);
  app.use("/api/cron", require("./routes/brief").cron);
  app.use("/api/liens", require("./routes/liens").router);
  app.use("/api", require("./routes/public").router);

  // Favicon et icône d'écran d'accueil : le logo choisi par Paule dans
  // Réglages → Identité de marque (ou, à défaut, l'icône d'origine du site).
  // Avec Cloudinary, l'image est recadrée au bon format à la volée.
  function iconeCloudinary(url, taille, fond) {
    if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url)) return null;
    const t = `c_pad,w_${taille},h_${taille}${fond ? ",b_" + fond : ""},f_png`;
    return url.replace(/\/upload\/(f_auto,q_auto\/)?/, `/upload/${t}/`);
  }
  app.get(["/api/favicon", "/favicon.ico"], async (req, res) => {
    const p = (await col("settings").findOne({ key: "profile" })) || {};
    const source = String(p.favicon || p.logo || "").trim();
    const apple = req.query.type === "apple";
    // iOS ne lit pas les icônes SVG : l'icône d'écran d'accueil par défaut est un PNG
    let cible = apple ? "/media/app-180.png" : "/media/favicon.svg";
    if (/^(\/|https:\/\/)/.test(source)) cible = iconeCloudinary(source, apple ? 180 : 64, apple ? "white" : "") || source;
    res.set("Cache-Control", "public, max-age=300");
    res.redirect(302, cible);
  });

  // Espace pro installable (écran d'accueil du téléphone, application sur l'ordinateur)
  app.get("/api/manifest-admin", async (_req, res) => {
    let source = "";
    try {
      const p = (await col("settings").findOne({ key: "profile" })) || {};
      source = String(p.favicon || p.logo || "").trim();
    } catch (e) { /* icônes par défaut */ }
    const perso = [iconeCloudinary(source, 192, "white"), iconeCloudinary(source, 512, "white")];
    const icons = perso[0] && perso[1]
      ? [{ src: perso[0], sizes: "192x192", type: "image/png", purpose: "any" }, { src: perso[1], sizes: "512x512", type: "image/png", purpose: "any" }]
      : [{ src: "/media/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/media/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/media/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }];
    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/manifest+json").send(JSON.stringify({
      id: "/admin", name: "Espace pro · Paule Ackerman", short_name: "Espace pro", lang: "fr", dir: "ltr",
      description: "Messages, clients, équipe IA, calendrier, agenda et finances",
      start_url: "/admin", scope: "/admin", display: "standalone", background_color: "#0B0E15", theme_color: "#0B0E15",
      icons,
      shortcuts: [
        { name: "Messages", url: "/admin#messages" }, { name: "Équipe IA", url: "/admin#equipe" },
        { name: "Calendrier", url: "/admin#calendrier" }, { name: "Agenda", url: "/admin#agenda" },
      ],
    }));
  });

  // Validation de Google Search Console (méthode « fichier HTML », réglée dans Référencement)
  app.get(/^\/google[0-9a-z]{6,64}\.html$/i, seo.fichierVerification);

  // Diagnostic : permet de vérifier après un déploiement que la base et
  // Cloudinary sont bien branchés, sans avoir à se connecter à l'admin.
  app.get("/api/health", (_req, res) => res.json({
    ok: true,
    store: store.kind,
    medias: require("./cloudinary").configured ? "cloudinary" : "base",
    ia: { claude: require("./ai/claude").estConfigure(), openai: require("./ai/openai").estConfigure("agenda") },
    alertesEmail: !!(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL),
    googleAgenda: require("./googleAgenda").configure(),
  }));

  // Site statique (index.html, admin.html, médias du dépôt)
  if (fs.existsSync(CLIENT_DIR)) {
    app.use(express.static(CLIENT_DIR, { maxAge: "1h", setHeaders: (res, p) => {
      if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      if (p.includes(`${path.sep}media${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }}));
    app.get("/admin", (_req, res) => res.sendFile(path.join(CLIENT_DIR, "admin.html")));
    // Pages des clients (validation, brief, avis, devis, rapport) : même fichier, le jeton est lu dans l'adresse
    app.get("/lien/:jeton", (_req, res) => res.sendFile(path.join(CLIENT_DIR, "lien.html")));
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
