const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { col } = require("../store");
const { JWT_SECRET, JWT_TTL, DEFAULT_ADMIN_PASSWORD } = require("../config");
const { requireAdmin } = require("../middleware/auth");
const o = require("../outils");
const totp = require("../totp");

const router = express.Router();
const route = o.enveloppe("auth");

// Crée le hash admin au premier démarrage
async function ensureAdmin() {
  const existing = await col("settings").findOne({ key: "admin" });
  if (!existing) {
    const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await col("settings").insert({ key: "admin", hash });
    console.log("[auth] compte admin initialisé (mot de passe par défaut — à changer)");
  }
}
const lireAdmin = () => col("settings").findOne({ key: "admin" });
const jetonAdmin = () => jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: JWT_TTL });

/* ---------------- Tentatives de connexion, comptées en base ----------------
   Sur Vercel, chaque requête peut tomber sur une instance neuve : un compteur
   en mémoire ne protège de rien. 5 échecs en 10 min par connexion ; au-delà
   de 60 échecs en une heure sur tout le site, une connexion qui s'est déjà
   trompée doit attendre (une attaque répartie ne bloque pas Paule). */
const FENETRE_IP = 10 * 60 * 1000, MAX_IP = 5, FENETRE_SITE = 60 * 60 * 1000, MAX_SITE = 60;
async function tentatives(cle, fenetre) {
  const doc = await col("tentatives").findOne({ cle });
  const depuis = Date.now() - fenetre;
  return { doc, echecs: ((doc && doc.echecs) || []).filter((t) => Date.parse(t) > depuis) };
}
async function bloque(req) {
  const [ip, site] = await Promise.all([tentatives(o.empreinteIp(req, "login:"), FENETRE_IP), tentatives("site", FENETRE_SITE)]);
  return ip.echecs.length >= MAX_IP || (site.echecs.length >= MAX_SITE && ip.echecs.length > 0);
}
async function noterEchec(req) {
  const t = new Date().toISOString();
  for (const [cle, fenetre] of [[o.empreinteIp(req, "login:"), FENETRE_IP], ["site", FENETRE_SITE]]) {
    const x = await tentatives(cle, fenetre);
    const echecs = x.echecs.concat(t).slice(-200);
    if (x.doc) await col("tentatives").update(x.doc._id, { echecs });
    else await col("tentatives").insert({ cle, echecs });
  }
}
async function effacerEchecs(req) {
  const x = await col("tentatives").findOne({ cle: o.empreinteIp(req, "login:") });
  if (x) await col("tentatives").update(x._id, { echecs: [] });
}
const TROP = "Trop de tentatives : réessayez dans quelques minutes";

/* ---------------- Double authentification ----------------
   ADMIN_2FA_OFF=1 dans Vercel la suspend (téléphone et codes de secours perdus). */
const suspendue = () => !!process.env.ADMIN_2FA_OFF;
const deuxEtapes = (admin) => !!(admin && admin.totp && admin.totp.actif) && !suspendue();

/** Code à 6 chiffres de l'application ou code de secours (usage unique). */
async function verifierCode(admin, code) {
  const t = admin.totp || {};
  const secret = totp.dechiffrer(t.secret);
  if (!secret) return { ok: false, message: "Double authentification illisible (JWT_SECRET a changé ?) : ajoutez ADMIN_2FA_OFF=1 dans Vercel pour vous reconnecter" };
  const brut = String(code || "").trim();
  if (/^[\d\s]{6,9}$/.test(brut)) {
    const pas = totp.verifier(secret, brut, t.dernierPas);
    if (pas == null) return { ok: false };
    await col("settings").update(admin._id, { totp: Object.assign({}, t, { dernierPas: pas }) });
    return { ok: true };
  }
  const i = totp.trouverSecours(t.secours, brut);
  if (i === -1) return { ok: false };
  const secours = t.secours.slice();
  secours.splice(i, 1);
  await col("settings").update(admin._id, { totp: Object.assign({}, t, { secours }) });
  await o.evenement("securite", "Connexion avec un code de secours", secours.length + " code(s) de secours restant(s)", "reglages", "key");
  return { ok: true, secours: true, restants: secours.length };
}

/* ---------------- Connexion ---------------- */
router.post("/login", route(async (req, res) => {
  if (await bloque(req)) throw o.erreur(429, TROP);
  const { password } = req.body || {};
  const admin = await lireAdmin();
  if (typeof password !== "string" || !password || !admin || !(await bcrypt.compare(password, admin.hash))) {
    await noterEchec(req);
    throw o.erreur(401, "Mot de passe incorrect");
  }
  if (deuxEtapes(admin)) {
    // Mot de passe juste : un ticket de 5 minutes pour saisir le code (il n'ouvre rien d'autre)
    return res.json({ deuxEtapes: true, ticket: jwt.sign({ role: "2fa" }, JWT_SECRET, { expiresIn: "5m" }) });
  }
  await effacerEchecs(req);
  res.json({ token: jetonAdmin() });
}));

router.post("/login/code", route(async (req, res) => {
  if (await bloque(req)) throw o.erreur(429, TROP);
  const b = req.body || {};
  let p = null;
  try { p = jwt.verify(String(b.ticket || ""), JWT_SECRET); } catch (e) { p = null; }
  if (!p || p.role !== "2fa") throw o.erreur(401, "Délai dépassé : saisissez à nouveau votre mot de passe");
  const admin = await lireAdmin();
  if (deuxEtapes(admin)) {
    const r = await verifierCode(admin, b.code);
    if (!r.ok) {
      await noterEchec(req);
      throw o.erreur(400, r.message || "Code incorrect");
    }
    await effacerEchecs(req);
    return res.json({ token: jetonAdmin(), secoursRestants: r.secours ? r.restants : null });
  }
  res.json({ token: jetonAdmin() });
}));

router.post("/password", requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ erreur: "8 caractères minimum" });
  }
  const admin = await lireAdmin();
  await col("settings").update(admin._id, { hash: await bcrypt.hash(password, 10) });
  await o.evenement("securite", "Mot de passe changé", "", "reglages", "lock-key");
  res.json({ ok: true });
});

/* ---------------- Réglages de la double authentification ---------------- */
router.get("/2fa", requireAdmin, route(async (_req, res) => {
  const t = ((await lireAdmin()) || {}).totp || {};
  res.json({
    actif: !!t.actif, depuis: t.activeLe || "", secoursRestants: (t.secours || []).length,
    suspendue: suspendue(), lisible: !t.actif || !!totp.dechiffrer(t.secret),
  });
}));
router.post("/2fa/preparer", requireAdmin, route(async (_req, res) => {
  const admin = await lireAdmin();
  if (admin.totp && admin.totp.actif) throw o.erreur(400, "Déjà active : désactivez-la d’abord pour changer de téléphone");
  const secret = totp.nouveauSecret();
  await col("settings").update(admin._id, { totp: { actif: false, attente: totp.chiffrer(secret), attenteLe: new Date().toISOString() } });
  res.json({ secret, uri: totp.uri(secret, "Espace pro", "Paule Ackerman") });
}));
router.post("/2fa/activer", requireAdmin, route(async (req, res) => {
  const admin = await lireAdmin();
  const t = admin.totp || {};
  if (t.actif) throw o.erreur(400, "La double authentification est déjà active");
  const secret = totp.dechiffrer(t.attente);
  if (!secret || Date.now() - Date.parse(t.attenteLe || 0) > 30 * 60 * 1000) throw o.erreur(400, "Recommencez : scannez à nouveau le QR code");
  const pas = totp.verifier(secret, (req.body || {}).code, null);
  if (pas == null) throw o.erreur(400, "Code incorrect : vérifiez que l’heure de votre téléphone est automatique, puis réessayez");
  const codes = totp.nouveauxCodesSecours(8);
  await col("settings").update(admin._id, {
    totp: { actif: true, secret: totp.chiffrer(secret), dernierPas: pas, secours: codes.map(totp.empreinteSecours), activeLe: new Date().toISOString() },
  });
  await o.evenement("securite", "Double authentification activée", "", "reglages", "shield-check");
  res.json({ ok: true, codes });
}));
router.post("/2fa/desactiver", requireAdmin, route(async (req, res) => {
  const admin = await lireAdmin();
  if (!admin.totp || !admin.totp.actif) return res.json({ ok: true });
  if (!suspendue()) {
    const r = await verifierCode(admin, (req.body || {}).code);
    if (!r.ok) throw o.erreur(400, r.message || "Code incorrect");
  }
  await col("settings").update(admin._id, { totp: { actif: false } });
  await o.evenement("securite", "Double authentification désactivée", "", "reglages", "shield-slash");
  res.json({ ok: true });
}));
router.post("/2fa/secours", requireAdmin, route(async (req, res) => {
  const admin = await lireAdmin();
  if (!admin.totp || !admin.totp.actif) throw o.erreur(400, "La double authentification n’est pas active");
  const r = await verifierCode(admin, (req.body || {}).code);
  if (!r.ok) throw o.erreur(400, r.message || "Code incorrect");
  const frais = await lireAdmin();
  const codes = totp.nouveauxCodesSecours(8);
  await col("settings").update(frais._id, { totp: Object.assign({}, frais.totp, { secours: codes.map(totp.empreinteSecours) }) });
  res.json({ ok: true, codes });
}));

module.exports = { router, ensureAdmin };
