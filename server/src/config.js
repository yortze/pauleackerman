const path = require("path");

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
};
