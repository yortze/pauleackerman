const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");

function requireAdmin(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erreur: "Jeton manquant" });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    // Seul un jeton de session admin ouvre l'espace pro (pas le ticket de la double authentification)
    if (!p || p.role !== "admin") throw new Error("rôle");
    req.admin = p;
    next();
  } catch {
    res.status(401).json({ erreur: "Jeton invalide ou expiré" });
  }
}

module.exports = { requireAdmin };
