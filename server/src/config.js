const path = require("path");

// Cloudinary : soit les trois variables séparées, soit l'URL unique
// `cloudinary://<api_key>:<api_secret>@<cloud_name>` fournie par le dashboard.
function cloudinaryFromUrl(url) {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(String(url || "").trim());
  return m ? { key: m[1], secret: m[2], cloud: m[3] } : null;
}
const fromUrl = cloudinaryFromUrl(process.env.CLOUDINARY_URL) || {};

const MO = 1024 * 1024;

module.exports = {
  PORT: process.env.PORT || 5051,
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, "..", "data"),
  MONGODB_URI: process.env.MONGODB_URI || "", // vide → stockage JSON local
  JWT_SECRET: process.env.JWT_SECRET || "paule-dev-secret-change-me",
  JWT_TTL: "12h",
  // Mot de passe admin par défaut (premier démarrage uniquement, ensuite hashé
  // dans la collection "settings"; modifiable via POST /api/auth/password)
  DEFAULT_ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "paule-admin",
  CLIENT_DIR: path.join(__dirname, "..", "..", "client"),

  // --- Cloudinary (hébergement des photos/vidéos importées depuis l'admin) ---
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || fromUrl.cloud || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || fromUrl.key || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || fromUrl.secret || "",
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER || "pauleackerman",
  // Plafonds côté navigateur (plan gratuit Cloudinary : 10 Mo image, 100 Mo vidéo)
  MAX_IMAGE_SIZE: Number(process.env.MAX_IMAGE_SIZE || 10 * MO),
  MAX_VIDEO_SIZE: Number(process.env.MAX_VIDEO_SIZE || 100 * MO),
  // Repli sans Cloudinary : stockage en base (limite MongoDB 16 Mo en base64)
  MAX_DB_SIZE: Number(process.env.MAX_DB_SIZE || 10 * MO),
};
