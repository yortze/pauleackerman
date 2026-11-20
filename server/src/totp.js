// Double authentification (TOTP, RFC 6238) sans dépendance : codes à 6 chiffres
// de Google Authenticator, Microsoft Authenticator, 2FAS… et codes de secours.
// Le secret est chiffré en base (AES-256-GCM, clé dérivée de JWT_SECRET).
const crypto = require("crypto");
const { JWT_SECRET } = require("./config");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PAS = 30; // secondes

function base32(buf) {
  let bits = 0, val = 0, out = "";
  for (const b of buf) {
    val = ((val << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function depuisBase32(s) {
  const t = String(s || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0;
  const out = [];
  for (const c of t) {
    val = ((val << 5) | B32.indexOf(c)) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Code HOTP à 6 chiffres pour un compteur donné. */
function hotp(cle, compteur) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(compteur));
  const hm = crypto.createHmac("sha1", cle).update(msg).digest();
  const off = hm[hm.length - 1] & 0xf;
  const bin = ((hm[off] & 0x7f) << 24) | (hm[off + 1] << 16) | (hm[off + 2] << 8) | hm[off + 3];
  return String(bin % 1000000).padStart(6, "0");
}
function egal(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const pasActuel = (ms) => Math.floor((ms == null ? Date.now() : ms) / 1000 / PAS);

/** Nouveau secret (160 bits, en base32 pour la saisie manuelle). */
function nouveauSecret() { return base32(crypto.randomBytes(20)); }

/** Code attendu à un instant (tests). */
function codeA(secret, ms) { return hotp(depuisBase32(secret), pasActuel(ms)); }

/**
 * Vérifie un code (tolérance d'un pas avant/après pour les horloges décalées).
 * Renvoie le pas utilisé, ou null. Un pas déjà utilisé (≤ dernierPas) est refusé : pas de rejeu.
 */
function verifier(secret, code, dernierPas, ms) {
  const c = String(code || "").replace(/\D/g, "");
  if (c.length !== 6) return null;
  const cle = depuisBase32(secret);
  const p0 = pasActuel(ms);
  for (const d of [0, -1, 1]) {
    const p = p0 + d;
    if (dernierPas != null && p <= dernierPas) continue;
    if (egal(hotp(cle, p), c)) return p;
  }
  return null;
}

/** Adresse otpauth:// lue par les applications (QR code). */
function uri(secret, compte, emetteur) {
  const e = encodeURIComponent(emetteur);
  return "otpauth://totp/" + e + ":" + encodeURIComponent(compte) + "?secret=" + secret + "&issuer=" + e + "&algorithm=SHA1&digits=6&period=" + PAS;
}

/* ---------------- Chiffrement du secret en base ---------------- */
const CLE_CHIFFREMENT = crypto.createHmac("sha256", JWT_SECRET).update("totp-secret-v1").digest();
function chiffrer(texte) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", CLE_CHIFFREMENT, iv);
  const enc = Buffer.concat([c.update(String(texte), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}
/** null si illisible (JWT_SECRET changé, donnée abîmée). */
function dechiffrer(s) {
  try {
    const [v, iv, tag, enc] = String(s || "").split(".");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", CLE_CHIFFREMENT, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch (e) {
    return null;
  }
}

/* ---------------- Codes de secours (usage unique) ---------------- */
const ALPHA = "23456789abcdefghjkmnpqrstuvwxyz"; // sans 0/o, 1/l/i
function nouveauxCodesSecours(n) {
  const codes = [];
  for (let i = 0; i < (n || 8); i++) {
    let s = "";
    for (let j = 0; j < 10; j++) s += ALPHA[crypto.randomInt(ALPHA.length)];
    codes.push(s.slice(0, 5) + "-" + s.slice(5));
  }
  return codes;
}
const normaliserSecours = (c) => String(c || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function empreinteSecours(c) {
  return crypto.createHmac("sha256", JWT_SECRET).update("secours:" + normaliserSecours(c)).digest("hex");
}
/** Index du code de secours correspondant dans la liste d'empreintes, ou -1. */
function trouverSecours(empreintes, code) {
  if (normaliserSecours(code).length !== 10) return -1;
  const e = empreinteSecours(code);
  return (empreintes || []).findIndex((x) => egal(x, e));
}

module.exports = {
  PAS, base32, depuisBase32, hotp, nouveauSecret, codeA, verifier, uri, chiffrer, dechiffrer,
  nouveauxCodesSecours, empreinteSecours, trouverSecours, normaliserSecours,
};
