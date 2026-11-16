// Pièces jointes des discussions avec l'équipe IA : captures d'écran et documents.
//
// Le navigateur prépare chaque fichier avant l'envoi : les images sont réduites
// (2576 px au plus, la limite de Claude), Word, Excel, PowerPoint et CSV sont
// convertis en texte, les PDF partent tels quels. Chaque pièce est stockée à part
// (collection « pieces ») ; les messages ne gardent que sa description et une vignette.
//
// À chaque tour, l'assistante relit les pièces des derniers échanges (8 au plus) :
// elle peut répondre à une question sur une capture envoyée deux messages plus tôt.
const { col } = require("../store");

const MO = 1024 * 1024;
const MAX_BINAIRE = 3 * MO; // image ou PDF : ≈ 4 Mo en base64, sous la limite de 4,5 Mo par requête de Vercel
const MAX_TEXTE = 200000; // caractères d'un document converti en texte
const MAX_APERCU = 60000; // vignette (data URL)
const MAX_PAR_MESSAGE = 6;
const MAX_RELUES = 8; // pièces renvoyées à l'IA à chaque tour, les plus récentes d'abord
const MAX_OCTETS_RELUS = 18 * MO;
const MESSAGES_RELUS = 6; // les pièces des 6 derniers messages restent visibles (≈ 3 échanges)
const RETENTION_JOURS = 90;
const ID_RE = /^[\w-]{1,64}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// Le contenu doit correspondre au type annoncé : Claude refuse une image mal étiquetée,
// et une pièce refusée bloquerait toute la discussion à chaque tour suivant.
const SIGNATURES = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/gif": (b) => b.subarray(0, 4).toString("latin1") === "GIF8",
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  "application/pdf": (b) => b.subarray(0, 1024).toString("latin1").includes("%PDF-"),
};

function erreur400(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}
const mo = (n) => (n / MO).toFixed(1).replace(".", ",") + " Mo";
const nomPropre = (n) => String(n || "").replace(/[\u0000-\u001f<>"\\]/g, "").trim().slice(0, 120) || "pièce jointe";

/** Ce que les messages gardent d'une pièce (sans son contenu). */
function publique(d) {
  const p = { id: String(d._id), nom: d.nom, type: d.type, taille: d.taille };
  if (d.apercu) p.apercu = d.apercu;
  return p;
}

/** Nature de la pièce, pour l'assistante et pour l'affichage. */
function genre(p) {
  if (p.type === "application/pdf") return "PDF";
  if (String(p.type).indexOf("image/") === 0) return "image";
  const ext = ((/\.([a-z0-9]+)$/i.exec(p.nom || "") || [])[1] || "").toLowerCase();
  return { docx: "document Word converti en texte", xlsx: "classeur Excel converti en texte", pptx: "présentation PowerPoint convertie en texte", csv: "tableau CSV" }[ext] || "texte";
}

let dernierePurge = 0;
async function purger() {
  if (Date.now() - dernierePurge < 3600e3) return;
  dernierePurge = Date.now();
  try {
    await col("pieces").removeWhere({}, { before: new Date(Date.now() - RETENTION_JOURS * 864e5).toISOString() });
  } catch (e) {
    console.error("[pieces] purge impossible :", e.message);
  }
}

/**
 * Enregistre une pièce préparée par le navigateur.
 * `pour` : « agent:<assistante> » ou « debrief:<id> » (déjà vérifié par la route).
 */
async function enregistrer(entree, pour) {
  const e = entree || {};
  const nom = nomPropre(e.nom);
  const type = String(e.type || "");
  const doc = { pour, nom, type };
  if (type === "text/plain") {
    const texte = String(e.texte == null ? "" : e.texte);
    if (!texte.trim()) throw erreur400(`« ${nom} » ne contient pas de texte lisible.`);
    if (texte.length > MAX_TEXTE) throw erreur400(`« ${nom} » est trop long (${MAX_TEXTE.toLocaleString("fr-FR")} caractères au plus).`);
    doc.texte = texte;
    doc.taille = Buffer.byteLength(texte);
  } else if (SIGNATURES[type]) {
    const data = String(e.data || "");
    if (!BASE64_RE.test(data)) throw erreur400(`« ${nom} » est illisible.`);
    const octets = Buffer.from(data, "base64");
    if (octets.length > MAX_BINAIRE) throw erreur400(`« ${nom} » pèse ${mo(octets.length)} : 3 Mo au plus.`);
    if (!SIGNATURES[type](octets)) throw erreur400(`« ${nom} » n’est pas ${type === "application/pdf" ? "un vrai PDF" : "une image valide"}.`);
    doc.data = data;
    doc.taille = octets.length;
  } else {
    throw erreur400(`« ${nom} » : format non pris en charge.`);
  }
  if (e.apercu) {
    const a = String(e.apercu);
    if (a.length > MAX_APERCU || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(a)) throw erreur400("Vignette invalide.");
    doc.apercu = a;
  }
  await purger();
  return publique(await col("pieces").insert(doc));
}

/**
 * Vérifie les pièces jointes d'un message (envoyées pour cette discussion).
 * Renvoie leurs descriptions et leurs contenus déjà chargés.
 */
async function attacher(ids, pour) {
  const liste = Array.isArray(ids) ? Array.from(new Set(ids.map(String))) : [];
  if (liste.length > MAX_PAR_MESSAGE) throw erreur400(`${MAX_PAR_MESSAGE} pièces jointes au plus par message.`);
  const pieces = [];
  const docs = new Map();
  for (const id of liste) {
    if (!ID_RE.test(id)) throw erreur400("Pièce jointe invalide.");
    const d = await col("pieces").get(id);
    if (!d || d.pour !== pour) throw erreur400("Une pièce jointe a expiré : joignez-la de nouveau.");
    pieces.push(publique(d));
    docs.set(String(d._id), d);
  }
  return { pieces, docs };
}

/**
 * Choisit les pièces que l'assistante relira à ce tour : celles des derniers
 * messages, les plus récentes d'abord, dans la limite de 8 pièces et 18 Mo.
 * `tours` : [{ role, pieces }] dans l'ordre de la discussion.
 */
async function chargerPourIA(tours, connus) {
  const choisies = [];
  let octets = 0;
  const debut = Math.max(0, tours.length - 1 - MESSAGES_RELUS);
  for (let i = tours.length - 1; i >= debut && choisies.length < MAX_RELUES; i--) {
    const ps = tours[i].pieces || [];
    for (let j = ps.length - 1; j >= 0 && choisies.length < MAX_RELUES; j--) {
      const poids = Math.ceil((ps[j].taille || 0) * 4 / 3);
      if (octets + poids > MAX_OCTETS_RELUS) continue;
      octets += poids;
      choisies.push(ps[j].id);
    }
  }
  const docs = new Map();
  await Promise.all(choisies.map(async (id) => {
    const d = (connus && connus.get(id)) || (await col("pieces").get(id));
    if (d) docs.set(id, d);
  }));
  return docs;
}

function texteDuTour(texte, pieces, docs) {
  const absentes = pieces.filter((p) => !docs.has(p.id)).map((p) => p.nom);
  const note = absentes.length ? `[Pièces jointes envoyées plus tôt, plus transmises : ${absentes.join(", ")}.]\n` : "";
  return (note + (texte || "")).trim() || "(Paule a envoyé ces pièces jointes sans message.)";
}

/** Message de Paule au format Claude : les pièces d'abord, puis son texte. */
function contenuClaude(texte, pieces, docs) {
  const blocs = [];
  pieces.filter((p) => docs.has(p.id)).forEach((p, i) => {
    const d = docs.get(p.id);
    blocs.push({ type: "text", text: `Pièce jointe ${i + 1} : ${d.nom} (${genre(d)})` });
    if (d.type === "application/pdf") blocs.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: d.data }, title: d.nom });
    else if (d.type === "text/plain") blocs.push({ type: "document", source: { type: "text", media_type: "text/plain", data: d.texte }, title: d.nom });
    else blocs.push({ type: "image", source: { type: "base64", media_type: d.type, data: d.data } });
  });
  blocs.push({ type: "text", text: texteDuTour(texte, pieces, docs) });
  return blocs;
}

/** Message de Paule au format OpenAI (API Responses). */
function contenuOpenAI(texte, pieces, docs) {
  const blocs = [];
  pieces.filter((p) => docs.has(p.id)).forEach((p, i) => {
    const d = docs.get(p.id);
    const titre = `Pièce jointe ${i + 1} : ${d.nom} (${genre(d)})`;
    if (d.type === "text/plain") {
      blocs.push({ type: "input_text", text: `${titre}\n<document>\n${d.texte}\n</document>` });
      return;
    }
    blocs.push({ type: "input_text", text: titre });
    if (d.type === "application/pdf") {
      blocs.push({ type: "input_file", filename: /\.pdf$/i.test(d.nom) ? d.nom : d.nom + ".pdf", file_data: "data:application/pdf;base64," + d.data });
    } else {
      blocs.push({ type: "input_image", image_url: `data:${d.type};base64,${d.data}`, detail: "high" });
    }
  });
  blocs.push({ type: "input_text", text: texteDuTour(texte, pieces, docs) });
  return blocs;
}

const idsDe = (messages) => (messages || []).reduce((l, m) => l.concat((m.pieces || []).map((p) => p.id)), []);

/** Supprime les pièces de messages qui sortent de l'historique. */
async function supprimerDesMessages(messages) {
  const ids = idsDe(messages);
  if (ids.length) await col("pieces").removeMany(ids);
}
/** Supprime toutes les pièces d'une discussion ou d'un débrief. */
async function supprimerPour(pour) {
  await col("pieces").removeWhere({ pour });
}

/** Une ligne pour les aperçus et le fil des débriefs : « 2 pièces jointes : a.jpg, b.pdf ». */
function resume(pieces) {
  if (!pieces || !pieces.length) return "";
  return (pieces.length > 1 ? pieces.length + " pièces jointes : " : "Pièce jointe : ") + pieces.map((p) => p.nom).join(", ");
}
/** Un message sans les vignettes (pour les listes, plus légères). */
function sansApercu(m) {
  if (!m || !m.pieces) return m;
  return Object.assign({}, m, { pieces: m.pieces.map((p) => ({ id: p.id, nom: p.nom, type: p.type, taille: p.taille })) });
}

module.exports = {
  MAX_PAR_MESSAGE, MESSAGES_RELUS,
  enregistrer, attacher, chargerPourIA, contenuClaude, contenuOpenAI,
  supprimerDesMessages, supprimerPour, resume, sansApercu, genre,
};
