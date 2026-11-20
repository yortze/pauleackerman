// Notifications sur le téléphone ou l'ordinateur de Paule (Web Push), même
// quand l'espace pro est fermé. Paule les active par appareil dans Réglages.
// Clés VAPID : variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si elles existent,
// sinon générées une fois et gardées en base (jamais exportées).
const webpush = require("web-push");
const { col } = require("./store");
const o = require("./outils");

const TYPES = {
  demande: "Nouvelle demande sur le site",
  rdv: "Rendez-vous réservé sur le site",
  validation: "Un client valide une publication ou demande une retouche",
  brief: "Un client remplit son questionnaire",
  avis: "Nouvel avis client",
  devis: "Devis accepté en ligne",
  matin: "Brief du matin (vers 7 h)",
};
// Services de notification des navigateurs (Chrome, Firefox, Safari, Edge) : rien d'autre n'est appelé
const SERVICES = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)(:443)?\//i;

let clesCache = null;
async function cles() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  if (clesCache) return clesCache;
  let d = await col("settings").findOne({ key: "push_vapid" });
  if (!d || !d.publicKey || !d.privateKey) {
    const k = webpush.generateVAPIDKeys();
    d = await o.majReglage("push_vapid", { publicKey: k.publicKey, privateKey: k.privateKey });
  }
  clesCache = { publicKey: d.publicKey, privateKey: d.privateKey };
  return clesCache;
}
const sujet = () => process.env.VAPID_SUBJECT || (process.env.SITE_URL || "https://www.pauleackerman.com").replace(/\/+$/, "");

async function preferences() {
  const r = await o.reglage("push_prefs", { types: {} });
  const types = {};
  Object.keys(TYPES).forEach((k) => { types[k] = !(r.types && r.types[k] === false); });
  return types;
}

/** Enregistre l'abonnement d'un appareil (ou le met à jour). */
async function abonner(sub, appareil) {
  if (!sub || typeof sub.endpoint !== "string" || !SERVICES.test(sub.endpoint) || sub.endpoint.length > 1000) throw o.erreur(400, "Abonnement refusé par le serveur");
  const keys = sub.keys || {};
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(String(keys.p256dh || "")) || !/^[A-Za-z0-9_-]{10,100}$/.test(String(keys.auth || ""))) throw o.erreur(400, "Abonnement incomplet");
  const doc = { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, appareil: o.texte(appareil, 80) || "Appareil" };
  const ancien = await col("push_abonnements").findOne({ endpoint: sub.endpoint });
  if (ancien) return col("push_abonnements").update(ancien._id, doc);
  const tous = await col("push_abonnements").all();
  if (tous.length >= 10) await col("push_abonnements").remove(tous[0]._id); // 10 appareils au plus
  return col("push_abonnements").insert(doc);
}

/**
 * Envoie une notification à tous les appareils abonnés. Ne lève jamais d'erreur.
 * { titre, corps, lien (route de l'admin), type (voir TYPES) } → nombre d'appareils atteints.
 */
async function envoyer(n) {
  try {
    const abonnes = await col("push_abonnements").all();
    if (!abonnes.length) return 0;
    if (n.type && TYPES[n.type] && !(await preferences())[n.type]) return 0;
    const k = await cles();
    const charge = JSON.stringify({ titre: o.texte(n.titre, 120), corps: o.texte(n.corps, 240), lien: o.texte(n.lien, 120), type: o.texte(n.type, 20) });
    const res = await Promise.all(abonnes.map(async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: a.keys }, charge, {
          vapidDetails: { subject: sujet(), publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 12 * 3600, urgency: "high", timeout: 6000,
        });
        return 1;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await col("push_abonnements").remove(a._id); // appareil désabonné
        else console.warn("[push]", e.statusCode || "", e.body || e.message);
        return 0;
      }
    }));
    return res.reduce((s, x) => s + x, 0);
  } catch (e) {
    console.warn("[push] envoi impossible :", e.message);
    return 0;
  }
}

module.exports = { TYPES, cles, preferences, abonner, envoyer };
