// Synchronisation des rendez-vous avec le Google Agenda de Paule.
//
// Un compte de service Google écrit directement dans son agenda :
//   GOOGLE_SERVICE_ACCOUNT : contenu du fichier JSON de la clé du compte de service
//                            (tel quel, ou encodé en base64)
//   GOOGLE_CALENDAR_ID     : l'agenda à remplir, en général son adresse Gmail
// Paule partage son agenda avec l'adresse du compte de service, avec le droit
// « Apporter des modifications aux événements ». Les notifications sont ensuite
// celles de Google Agenda (téléphone, Chrome).
//
// Chaque rendez-vous devient un événement dont l'identifiant est dérivé de celui
// du rendez-vous : créer, déplacer ou annuler reste idempotent, sans rien
// stocker de plus. Sans les deux variables, ce module ne fait rien. Une erreur
// Google ne bloque jamais l'action de Paule ou du visiteur : elle est notée et
// affichée dans Réglages.
const crypto = require("crypto");
const { col } = require("./store");

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3";
const FUSEAU = "Africa/Libreville";
const DELAI_MS = 8000;
const CLE_ETAT = "google_agenda";
const SOURCES = { site: "réservé sur le site", "assistant IA": "créé par Awa", manuel: "ajouté dans l’espace pro" };

function erreur(message) { const e = new Error(message); e.google = true; return e; }
function idCalendrier() { return String(process.env.GOOGLE_CALENDAR_ID || "").trim(); }
function site() { return String(process.env.SITE_URL || "https://www.pauleackerman.com").replace(/\/+$/, ""); }

/* ---------------- Compte de service ---------------- */
let memo = { brut: null, compte: null };
/** null si la variable est absente, { invalide: true } si elle est illisible. */
function compteService() {
  const brut = String(process.env.GOOGLE_SERVICE_ACCOUNT || "").trim();
  if (!brut) return null;
  if (memo.brut === brut) return memo.compte;
  let json = null;
  for (const essai of [() => JSON.parse(brut), () => JSON.parse(Buffer.from(brut, "base64").toString("utf8"))]) {
    try { json = essai(); break; } catch (e) { json = null; }
  }
  const compte = json && json.client_email && json.private_key
    ? { email: String(json.client_email), cle: String(json.private_key).replace(/\\n/g, "\n"), tokenUri: json.token_uri || "https://oauth2.googleapis.com/token" }
    : { invalide: true };
  memo = { brut, compte };
  return compte;
}

function configure() {
  const c = compteService();
  return !!(idCalendrier() && c && !c.invalide);
}

function appel(url, opts) {
  return fetch(url, Object.assign({ signal: AbortSignal.timeout(DELAI_MS) }, opts)).catch((e) => {
    throw erreur(e && e.name === "TimeoutError" ? "Google Agenda ne répond pas (délai dépassé)." : "Google Agenda injoignable : " + e.message);
  });
}

let jeton = null; // { valeur, expire, pour }
async function jetonAcces(c) {
  if (jeton && jeton.pour === c.email && jeton.expire > Date.now() + 60000) return jeton.valeur;
  const maintenant = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const nonSigne = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: c.email, scope: SCOPE, aud: c.tokenUri, iat: maintenant, exp: maintenant + 3600 });
  let signature;
  try {
    signature = crypto.createSign("RSA-SHA256").update(nonSigne).sign(c.cle).toString("base64url");
  } catch (e) {
    throw erreur("La clé privée du compte de service est illisible : recopiez tout le fichier JSON dans GOOGLE_SERVICE_ACCOUNT.");
  }
  const r = await appel(c.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: nonSigne + "." + signature }).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    throw erreur("Google a refusé la clé du compte de service" + (d.error_description ? " (" + d.error_description + ")" : "") +
      ". Vérifiez GOOGLE_SERVICE_ACCOUNT : la clé a peut-être été supprimée ou mal copiée.");
  }
  jeton = { valeur: d.access_token, expire: Date.now() + (Number(d.expires_in) || 3600) * 1000, pour: c.email };
  return jeton.valeur;
}

/** Requête sur l'agenda de Paule. Renvoie { status, ok, data } sans lever d'erreur HTTP. */
async function agenda(methode, chemin, corps) {
  const c = compteService();
  const t = await jetonAcces(c);
  const headers = { Authorization: "Bearer " + t };
  if (corps) headers["Content-Type"] = "application/json";
  const r = await appel(API + "/calendars/" + encodeURIComponent(idCalendrier()) + chemin, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, data };
}

/** Message clair (en français) pour une réponse d'erreur de Google. */
function expliquer(res) {
  const c = compteService() || {};
  const e = (res.data && res.data.error) || {};
  const raisons = ((e.errors || []).map((x) => x.reason).concat((e.details || []).map((x) => x.reason))).filter(Boolean).join(" ");
  const tout = raisons + " " + (e.message || "");
  if (res.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(tout)) {
    return "L’API Google Calendar n’est pas activée dans votre projet Google Cloud (API et services → Bibliothèque → Google Calendar API → Activer).";
  }
  if (res.status === 404) {
    return `Agenda introuvable. Dans Google Agenda, partagez votre agenda avec ${c.email || "le compte de service"} (droit « Apporter des modifications aux événements ») et vérifiez GOOGLE_CALENDAR_ID.`;
  }
  if (res.status === 403 && /requiredAccessLevel|forbidden|writer access/i.test(tout)) {
    return `Le compte de service ne peut pas modifier votre agenda : dans le partage, donnez à ${c.email || "son adresse"} le droit « Apporter des modifications aux événements ».`;
  }
  if (res.status === 401) return "Google a refusé l’accès. Vérifiez GOOGLE_SERVICE_ACCOUNT.";
  if (res.status === 429 || /rateLimit|quota/i.test(raisons)) return "Google limite temporairement les envois : réessayez dans quelques minutes.";
  return "Google Agenda : " + (e.message || "erreur " + res.status);
}

/* ---------------- Rendez-vous → événement ---------------- */
/** Identifiant d'événement stable (alphabet base32hex de Google : 0-9 et a-v). */
function idEvenement(idRdv) {
  return "pa" + String(idRdv).toLowerCase().replace(/[^0-9a-v]/g, "");
}

function evenement(r) {
  const debut = new Date(r.debut);
  const fin = new Date(debut.getTime() + (Number(r.dureeMin) || 30) * 60000);
  const aConfirmer = r.statut === "a_confirmer";
  const lignes = [];
  if (aConfirmer) lignes.push("À confirmer dans l’espace pro.", "");
  if (r.avec) lignes.push("Avec : " + r.avec);
  if (r.email) lignes.push("Email : " + r.email);
  if (r.telephone) lignes.push("Téléphone : " + r.telephone);
  if (r.notes) lignes.push("", String(r.notes));
  lignes.push("", "Rendez-vous " + (SOURCES[r.source] || "ajouté dans l’espace pro") + " · " + site() + "/admin#agenda");
  const ev = {
    summary: (aConfirmer ? "À confirmer · " : "") + [r.titre || "Rendez-vous", r.avec].filter(Boolean).join(" · "),
    description: lignes.join("\n").trim(),
    start: { dateTime: debut.toISOString(), timeZone: FUSEAU },
    end: { dateTime: fin.toISOString(), timeZone: FUSEAU },
    status: "confirmed",
    extendedProperties: { private: { rdv: String(r._id), origine: "pauleackerman" } },
  };
  if (r.lieu) ev.location = String(r.lieu);
  if (aConfirmer) ev.colorId = "5"; // jaune : à confirmer
  return ev;
}

/** Crée ou remplace l'événement (le restaure aussi s'il avait été supprimé dans Google Agenda). */
async function ecrire(r) {
  const id = idEvenement(r._id);
  const corps = evenement(r);
  let res = await agenda("PUT", "/events/" + id, corps);
  if (res.status === 404) res = await agenda("POST", "/events", Object.assign({ id }, corps));
  if (!res.ok) throw erreur(expliquer(res));
}

async function effacer(idRdv) {
  const res = await agenda("DELETE", "/events/" + idEvenement(idRdv));
  // 404 : jamais envoyé ; 410 : déjà supprimé. Les deux conviennent.
  if (!res.ok && res.status !== 404 && res.status !== 410) throw erreur(expliquer(res));
}

/* ---------------- État affiché dans Réglages ---------------- */
async function noter(ok, message) {
  try {
    const patch = { ok, message: String(message || "").slice(0, 400), date: new Date().toISOString() };
    const doc = await col("settings").findOne({ key: CLE_ETAT });
    if (doc) await col("settings").update(doc._id, patch);
    else await col("settings").insert(Object.assign({ key: CLE_ETAT }, patch));
  } catch (e) {
    console.warn("[google-agenda] état non enregistré :", e.message);
  }
}

async function etat() {
  const c = compteService();
  const doc = await col("settings").findOne({ key: CLE_ETAT });
  return {
    configure: configure(),
    calendrier: idCalendrier(),
    compteService: c && !c.invalide ? c.email : "",
    compteInvalide: !!(c && c.invalide),
    dernier: doc ? { ok: !!doc.ok, message: doc.message || "", date: doc.date } : null,
  };
}

/* ---------------- Points d'entrée ---------------- */
/**
 * À appeler après chaque création ou modification d'un rendez-vous.
 * Annulé → l'événement est retiré ; sinon il est créé ou mis à jour.
 * Ne lève jamais d'erreur : renvoie { ok } ou { ok: false, erreur }.
 */
async function synchroniser(r, opts) {
  if (!configure() || !r || !r._id) return { ok: true, ignore: true };
  const annule = r.statut === "annule";
  if (!annule && !r.debut) return { ok: true, ignore: true };
  try {
    if (annule) await effacer(r._id);
    else await ecrire(r);
    if (!(opts && opts.silencieux)) await noter(true, annule ? "Rendez-vous retiré de Google Agenda" : "Rendez-vous envoyé à Google Agenda");
    return { ok: true };
  } catch (e) {
    console.warn("[google-agenda]", e.message);
    if (!(opts && opts.silencieux)) await noter(false, e.message);
    return { ok: false, erreur: e.message };
  }
}

/** À appeler après la suppression définitive d'un rendez-vous. */
async function retirer(idRdv) {
  return synchroniser({ _id: idRdv, statut: "annule" });
}

/** Vérifie l'accès à l'agenda (lecture d'un événement) et le droit d'écriture. */
async function tester() {
  const c = compteService();
  let resultat;
  if (!idCalendrier() || !c) {
    resultat = { ok: false, message: "Ajoutez GOOGLE_CALENDAR_ID et GOOGLE_SERVICE_ACCOUNT dans Vercel, puis redéployez." };
  } else if (c.invalide) {
    resultat = { ok: false, message: "GOOGLE_SERVICE_ACCOUNT ne contient pas un fichier JSON de compte de service (il manque client_email ou private_key)." };
  } else {
    try {
      const res = await agenda("GET", "/events?maxResults=1&singleEvents=true&timeMin=" + encodeURIComponent(new Date().toISOString()));
      if (!res.ok) resultat = { ok: false, message: expliquer(res) };
      else if (res.data && res.data.accessRole && ["writer", "owner"].indexOf(res.data.accessRole) === -1) {
        resultat = { ok: false, message: `Le compte de service peut seulement lire votre agenda : dans le partage, donnez à ${c.email} le droit « Apporter des modifications aux événements ».` };
      } else {
        resultat = { ok: true, message: "Connexion réussie : le site peut écrire dans l’agenda « " + ((res.data && res.data.summary) || idCalendrier()) + " »." };
      }
    } catch (e) {
      resultat = { ok: false, message: e.message };
    }
  }
  if (c || idCalendrier()) await noter(resultat.ok, resultat.message);
  return resultat;
}

/** Envoie (ou retire) tous les rendez-vous à venir, par exemple juste après la mise en place. */
async function toutSynchroniser() {
  if (!configure()) return { ok: false, message: "Google Agenda n’est pas configuré." };
  const depuis = Date.now() - 24 * 3600000;
  const rdvs = (await col("rendezvous").all()).filter((r) => r.debut && new Date(r.debut).getTime() >= depuis);
  let envoyes = 0, retires = 0;
  const erreurs = [];
  for (const r of rdvs) {
    const res = await synchroniser(r, { silencieux: true });
    if (!res.ok) { erreurs.push(res.erreur); if (erreurs.length >= 3) break; }
    else if (r.statut === "annule") retires++;
    else envoyes++;
  }
  const ok = !erreurs.length;
  const message = ok
    ? `${envoyes} rendez-vous à venir envoyé${envoyes > 1 ? "s" : ""} à Google Agenda` + (retires ? `, ${retires} annulé${retires > 1 ? "s" : ""} retiré${retires > 1 ? "s" : ""}` : "") + "."
    : erreurs[0];
  await noter(ok, message);
  return { ok, message, envoyes, retires };
}

module.exports = { configure, synchroniser, retirer, tester, toutSynchroniser, etat, idEvenement, evenement };
