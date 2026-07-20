const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { col } = require("../store");
const { JWT_SECRET, JWT_TTL, DEFAULT_ADMIN_PASSWORD } = require("../config");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Crée le hash admin au premier démarrage
async function ensureAdmin() {
  const existing = await col("settings").findOne({ key: "admin" });
  if (!existing) {
    const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await col("settings").insert({ key: "admin", hash });
    console.log("[auth] compte admin initialisé (mot de passe par défaut — à changer)");
  }
}

// Anti-bruteforce naïf : 5 essais / 10 min / IP
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  attempts.set(ip, list);
  return list.length >= 5;
}

router.post("/login", async (req, res) => {
  const ip = req.ip;
  if (tooMany(ip)) return res.status(429).json({ erreur: "Trop de tentatives, réessayez plus tard" });
  const { password } = req.body || {};
  const admin = await col("settings").findOne({ key: "admin" });
  if (!password || !admin || !(await bcrypt.compare(password, admin.hash))) {
    attempts.get(ip).push(Date.now());
    return res.status(401).json({ erreur: "Mot de passe incorrect" });
  }
  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: JWT_TTL });
  res.json({ token });
});

router.post("/password", requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) {
    return res.status(400).json({ erreur: "8 caractères minimum" });
  }
  const admin = await col("settings").findOne({ key: "admin" });
  await col("settings").update(admin._id, { hash: await bcrypt.hash(password, 10) });
  res.json({ ok: true });
});

module.exports = { router, ensureAdmin };
