// Petits outils partagés par les routes du back office : validation des champs,
// jetons des liens clients, réglages, journal d'activité, limites d'envoi publiques.
const crypto = require("crypto");
const { col } = require("./store");
const { JWT_SECRET } = require("./config");

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
const MOIS_RE = /^\d{4}-\d{2}$/;
const ID_RE = /^[\w-]{1,64}$/;
const JETON_RE = /^[A-Za-z0-9_-]{16,64}$/;

function erreur(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
/** Route asynchrone : les erreurs avec un statut sont renvoyées telles quelles, les autres journalisées. */
function enveloppe(nom) {
  return (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    if (!e.status) console.error("[" + nom + "]", e);
    res.status(e.status || 500).json({ erreur: e.status ? e.message : "Erreur interne : " + e.message });
  });
}

const texte = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 2000);
/** « 150 000 », « 150000 FCFA », 150000 → 150000 (entier positif, FCFA) */
function montant(v) {
  const n = Number(String(v == null ? "" : v).replace(/[\s  ]/g, "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
const jour = (v) => (JOUR_RE.test(String(v || "")) ? String(v) : "");
const choix = (v, liste, defaut) => (liste.indexOf(v) !== -1 ? v : defaut);

/** Jeton de lien public : 144 bits aléatoires, impossible à deviner. */
function jeton() { return crypto.randomBytes(18).toString("base64url"); }

/** Empreinte de l'IP (jamais stockée en clair). */
function empreinteIp(req, prefixe) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "inconnue";
  return (prefixe || "") + crypto.createHmac("sha256", JWT_SECRET).update(ip).digest("hex").slice(0, 32);
}

function aujourdhui() { return new Date(Date.now() + 3600000).toISOString().slice(0, 10); }

/**
 * Limite d'envois des pages publiques (liens clients) : `max` par jour et par connexion,
 * comptés en base (sur Vercel, un compteur en mémoire ne protège de rien).
 */
async function limiter(req, cle, max) {
  const auj = aujourdhui();
  const c = empreinteIp(req, cle + ":");
  const doc = await col("ratelimit_liens").findOne({ cle: c });
  if (doc && doc.jour === auj && (doc.nb || 0) >= max) throw erreur(429, "Trop d’envois aujourd’hui depuis cette connexion. Réessayez demain.");
  if (doc) await col("ratelimit_liens").update(doc._id, doc.jour === auj ? { nb: (doc.nb || 0) + 1 } : { jour: auj, nb: 1 });
  else await col("ratelimit_liens").insert({ cle: c, jour: auj, nb: 1 });
  if (Math.random() < 0.05) {
    try { await col("ratelimit_liens").removeWhere({}, { before: new Date(Date.now() - 3 * 864e5).toISOString() }); } catch (e) { /* purge opportuniste */ }
  }
}

/* ---------------- Réglages (collection « settings », un document par clé) ---------------- */
async function reglage(key, defauts) {
  const d = await col("settings").findOne({ key });
  return Object.assign({}, defauts || {}, d || {}, { key });
}
async function majReglage(key, patch) {
  const d = await col("settings").findOne({ key });
  return d ? col("settings").update(d._id, patch) : col("settings").insert(Object.assign({ key }, patch));
}

/* ---------------- Journal d'activité (cloche de l'admin) ---------------- */
/**
 * type : avis | brief | validation | devis | rapport | memoire…
 * lien : route de l'admin à ouvrir (« clients/<id> », « calendrier »…).
 */
async function evenement(type, texteEv, sous, lien, icone) {
  try {
    await col("evenements").insert({ type, texte: texte(texteEv, 200), sous: texte(sous, 200), lien: texte(lien, 120), icone: icone || "" });
    if (Math.random() < 0.05) await col("evenements").removeWhere({}, { before: new Date(Date.now() - 90 * 864e5).toISOString() });
  } catch (e) {
    console.warn("[evenement]", e.message);
  }
}

/* ---------------- Liens publics des clients ----------------
   Un document par lien : { jeton, type, cible, clientId }.
   type : validation | brief | avis (cible = client), document, rapport. */
const TYPES_LIENS = ["validation", "brief", "avis", "document", "rapport"];
async function lienDe(type, cible) {
  return col("liens").findOne({ type, cible: String(cible) });
}
/** Crée le lien s'il n'existe pas (ou le remplace si `nouveau`), et renvoie son jeton. */
async function lienPour(type, cible, clientId, nouveau) {
  if (TYPES_LIENS.indexOf(type) === -1) throw erreur(400, "Type de lien inconnu");
  const ancien = await lienDe(type, cible);
  if (ancien && !nouveau) return ancien.jeton;
  if (ancien) await col("liens").remove(ancien._id);
  const d = await col("liens").insert({ jeton: jeton(), type, cible: String(cible), clientId: clientId ? String(clientId) : "" });
  return d.jeton;
}
async function supprimerLiens(cible) {
  await col("liens").removeWhere({ cible: String(cible) });
}

module.exports = {
  JOUR_RE, MOIS_RE, ID_RE, JETON_RE,
  erreur, enveloppe, texte, montant, jour, choix, jeton, empreinteIp, aujourdhui, limiter,
  reglage, majReglage, evenement, lienDe, lienPour, supprimerLiens, TYPES_LIENS,
};
