// Cloudinary sans SDK : on signe nous-mêmes les requêtes (SHA-1 des paramètres
// triés + api_secret, cf. doc « Generating authentication signatures »).
//
// L'api_secret ne quitte JAMAIS le serveur : l'admin demande une signature à
// /api/media/signature puis envoie le fichier directement à Cloudinary. Cela
// évite de faire transiter les vidéos par la fonction serverless Vercel, qui
// plafonne le corps des requêtes à ~4,5 Mo.
const crypto = require("crypto");
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_FOLDER,
} = require("./config");

const configured = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

/** Type de ressource Cloudinary attendu pour un type MIME donné. */
function resourceType(mime) {
  return String(mime || "").startsWith("video/") ? "video" : "image";
}

/** Signature Cloudinary : params triés par clé, joints en k=v&…, + api_secret. */
function sign(params) {
  const base = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(base + CLOUDINARY_API_SECRET).digest("hex");
}

/**
 * Paramètres à renvoyer à l'admin pour un upload direct navigateur → Cloudinary.
 * `folder` est signé : impossible de déposer ailleurs que dans le dossier du site.
 */
function uploadSignature(mime) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = CLOUDINARY_FOLDER;
  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    resourceType: resourceType(mime),
    timestamp,
    folder,
    signature: sign({ folder, timestamp }),
    endpoint: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType(mime)}/upload`,
  };
}

/** Supprime définitivement un média sur Cloudinary. */
async function destroy(publicId, type) {
  if (!configured || !publicId) return false;
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: CLOUDINARY_API_KEY,
    signature: sign({ public_id: publicId, timestamp }),
  });
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${type === "video" ? "video" : "image"}/destroy`;
  try {
    const r = await fetch(url, { method: "POST", body });
    const d = await r.json();
    return d && d.result === "ok";
  } catch (e) {
    console.error("[cloudinary] suppression impossible :", e.message);
    return false;
  }
}

/**
 * Vérifie qu'une réponse d'upload vient bien de notre compte Cloudinary et
 * qu'elle n'a pas été bricolée côté navigateur : on recalcule la signature
 * renvoyée par Cloudinary (public_id + version).
 */
function verifyUpload(res) {
  if (!res || !res.public_id || !res.version || !res.signature) return false;
  const expected = sign({ public_id: res.public_id, version: res.version });
  return expected === res.signature;
}

/** URL de livraison optimisée (format et qualité choisis automatiquement). */
function optimized(url) {
  // https://res.cloudinary.com/<cloud>/<type>/upload/<transformations>/<public_id>
  return String(url || "").replace("/upload/", "/upload/f_auto,q_auto/");
}

module.exports = {
  configured,
  resourceType,
  uploadSignature,
  destroy,
  verifyUpload,
  optimized,
  folder: CLOUDINARY_FOLDER,
  cloudName: CLOUDINARY_CLOUD_NAME,
};
