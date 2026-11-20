// Pages publiques des clients de Paule, ouvertes par un lien secret
// (/lien/<jeton>) : validation des publications, brief, avis, devis ou
// facture, rapport mensuel. Aucun compte : le jeton impossible à deviner
// fait office de clé, et Paule peut le remplacer à tout moment.
const express = require("express");
const { col } = require("../store");
const o = require("../outils");
const c = require("../compta");
const { alerter } = require("../alertes");

const router = express.Router();
const route = o.enveloppe("liens");

const BRIEF_QUESTIONS = [
  { k: "activite", label: "Présentez votre activité en quelques phrases", long: true },
  { k: "offres", label: "Vos produits ou services phares", long: true },
  { k: "cibles", label: "Vos clients idéaux : qui sont-ils, où sont-ils ?", long: true },
  { k: "objectifs", label: "Ce que vous attendez des réseaux sociaux (plus de clients, notoriété, lancement…)", long: true },
  { k: "ton", label: "Le ton qui vous ressemble (chaleureux, premium, drôle, sérieux…)" },
  { k: "charte", label: "Vos couleurs, polices et logo (liens bienvenus)", long: true },
  { k: "reseaux", label: "Vos comptes existants (liens)", long: true },
  { k: "inspirations", label: "Des comptes ou des concurrents que vous aimez, et pourquoi", long: true },
  { k: "eviter", label: "Ce qu’il faut éviter (sujets, mots, visuels)", long: true },
  { k: "budgetPub", label: "Budget publicité mensuel envisagé (en FCFA)" },
  { k: "validation", label: "Qui valide les publications chez vous ? (nom et WhatsApp)" },
  { k: "pratique", label: "Infos pratiques à afficher : adresse, horaires, contacts", long: true },
];

function entetes(res) {
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.set("Referrer-Policy", "no-referrer");
}
async function resoudre(jetonBrut) {
  const j = String(jetonBrut || "");
  if (!o.JETON_RE.test(j)) throw o.erreur(404, "Ce lien n’existe pas ou n’est plus valable.");
  const l = await col("liens").findOne({ jeton: j });
  if (!l) throw o.erreur(404, "Ce lien n’existe pas ou n’est plus valable. Demandez-en un nouveau à Paule.");
  return l;
}
async function paule() {
  const [p, f] = await Promise.all([col("settings").findOne({ key: "profile" }), o.reglage("facturation", c.FACTURATION_DEFAUT)]);
  const x = p || {};
  return {
    nom: x.nom || "Paule Ackerman", titre: x.titre || "Social media manager", photo: x.photo || "", logo: x.logo || "",
    telephone: x.telephone || f.telephone || "", whatsapp: x.whatsapp || x.telephone || "", email: x.email || f.email || "",
  };
}
function publicationPublique(p) {
  return {
    id: String(p._id), date: p.date, heure: p.heure || "", reseau: p.reseau, format: p.format, sujet: p.sujet || "", legende: p.legende || "",
    visuels: p.visuels || [], statut: p.statut, validation: p.validation || null,
    commentaires: (p.commentaires || []).map((x) => ({ auteur: x.auteur === "client" ? "client" : "paule", texte: x.texte, date: x.date })),
  };
}

router.get("/:jeton", route(async (req, res) => {
  entetes(res);
  const l = await resoudre(req.params.jeton);
  const base = { type: l.type, paule: await paule() };

  if (l.type === "validation" || l.type === "brief" || l.type === "avis") {
    const cl = await col("clients").get(l.cible);
    if (!cl) throw o.erreur(404, "Ce lien n’est plus valable.");
    base.client = { nom: cl.nom, entreprise: cl.entreprise || "", contact: cl.contact || "" };
    if (l.type === "validation") {
      const auj = o.aujourdhui();
      const posts = (await col("planning").all()).filter((p) => p.clientId === String(cl._id));
      base.aValider = posts.filter((p) => p.statut === "a_valider").sort((a, b) => a.date.localeCompare(b.date)).map(publicationPublique);
      base.recentes = posts.filter((p) => p.validation && p.statut !== "a_valider" && p.validation.date >= new Date(Date.now() - 30 * 864e5).toISOString())
        .sort((a, b) => String(b.validation.date).localeCompare(String(a.validation.date))).slice(0, 12).map(publicationPublique);
      base.aVenir = posts.filter((p) => p.statut === "valide" && p.date >= auj).length;
    }
    if (l.type === "brief") {
      base.questions = BRIEF_QUESTIONS;
      base.reponses = (cl.brief && cl.brief.reponses) || {};
      base.dejaRempli = !!(cl.brief && cl.brief.recuLe);
    }
    return res.json(base);
  }

  if (l.type === "document") {
    const d = await col("documents").get(l.cible);
    if (!d || d.statut === "brouillon") throw o.erreur(404, "Ce document n’est plus disponible.");
    const [cl, f] = await Promise.all([col("clients").get(d.clientId), o.reglage("facturation", c.FACTURATION_DEFAUT)]);
    const t = c.totaux(d);
    base.document = {
      type: d.type, numero: d.numero, statut: d.statut, dateEmission: d.dateEmission, echeance: d.echeance, objet: d.objet,
      lignes: d.lignes || [], remise: d.remise || 0, tva: d.tva || 0, acompte: d.acompte || 0, notes: d.notes || "",
      totaux: t, enRetard: c.enRetard(d), acceptation: d.acceptation || null,
    };
    base.client = cl ? { nom: cl.nom, entreprise: cl.entreprise || "", adresse: cl.adresse || "", email: cl.email || "", telephone: cl.telephone || "" } : { nom: d.clientNom || "" };
    base.emetteur = { raisonSociale: f.raisonSociale, adresse: f.adresse, telephone: f.telephone || base.paule.telephone, email: f.email || base.paule.email, nif: f.nif, rccm: f.rccm, paiement: f.paiement, mentions: f.mentions };
    return res.json(base);
  }

  if (l.type === "rapport") {
    const r = await col("rapports").get(l.cible);
    if (!r) throw o.erreur(404, "Ce rapport n’est plus disponible.");
    const cl = await col("clients").get(r.clientId);
    const duMois = (await col("planning").all()).filter((p) => p.clientId === r.clientId && String(p.date || "").slice(0, 7) === r.mois);
    base.client = { nom: (cl && cl.nom) || "" };
    base.rapport = {
      titre: r.titre, mois: r.mois, chiffres: r.chiffres || [], pointsForts: r.pointsForts || [], aAmeliorer: r.aAmeliorer || [],
      recommandations: r.recommandations || [], bilan: r.bilan || "",
      publications: { prevues: duMois.length, publiees: duMois.filter((p) => p.statut === "publie").length },
    };
    return res.json(base);
  }
  throw o.erreur(404, "Lien inconnu");
}));

/* ---------------- Validation d'une publication ---------------- */
router.post("/:jeton/valider", route(async (req, res) => {
  entetes(res);
  const l = await resoudre(req.params.jeton);
  if (l.type !== "validation") throw o.erreur(400, "Lien inadapté");
  const b = req.body || {};
  await o.limiter(req, "valider", 80);
  const p = o.ID_RE.test(String(b.id || "")) ? await col("planning").get(String(b.id)) : null;
  if (!p || p.clientId !== l.cible) throw o.erreur(404, "Publication introuvable");
  if (p.statut !== "a_valider") throw o.erreur(409, "Cette publication a déjà reçu une réponse. Merci !");
  const decision = b.decision === "ok" ? "ok" : "modif";
  const commentaire = o.texte(b.commentaire, 1500);
  if (decision === "modif" && !commentaire) throw o.erreur(400, "Dites à Paule ce qu’il faut changer");
  const nom = o.texte(b.nom, 80);
  const patch = {
    statut: decision === "ok" ? "valide" : "creation",
    validation: { decision, nom, date: new Date().toISOString() },
  };
  if (commentaire) patch.commentaires = (p.commentaires || []).concat([{ auteur: "client", nom, texte: commentaire, date: new Date().toISOString() }]).slice(-50);
  const n = await col("planning").update(p._id, patch);
  const cl = await col("clients").get(l.cible);
  const quoi = (p.sujet || p.format || "publication") + " (" + p.reseau + ", " + p.date + ")";
  await alerter({
    type: "validation", icone: decision === "ok" ? "check-circle" : "pencil-simple-line", lien: "calendrier/" + p._id,
    texte: (cl ? cl.nom : "Le client") + (decision === "ok" ? " a validé une publication" : " demande une modification"),
    sous: decision === "ok" ? quoi : quoi + " : « " + commentaire.slice(0, 140) + " »",
    email: decision !== "ok", details: commentaire,
  });
  res.json(publicationPublique(n));
}));

/* ---------------- Brief du client ---------------- */
router.post("/:jeton/brief", route(async (req, res) => {
  entetes(res);
  const l = await resoudre(req.params.jeton);
  if (l.type !== "brief") throw o.erreur(400, "Lien inadapté");
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // pot de miel
  await o.limiter(req, "brief", 12);
  const cl = await col("clients").get(l.cible);
  if (!cl) throw o.erreur(404, "Ce lien n’est plus valable.");
  const r = b.reponses || {};
  const reponses = {};
  BRIEF_QUESTIONS.forEach((q) => { const v = o.texte(r[q.k], q.long ? 3000 : 400); if (v) reponses[q.k] = v; });
  if (Object.keys(reponses).length < 2) throw o.erreur(400, "Répondez au moins à quelques questions avant d’envoyer.");
  const brief = { reponses, questions: BRIEF_QUESTIONS.map((q) => ({ k: q.k, label: q.label })), recuLe: new Date().toISOString(), envois: ((cl.brief && cl.brief.envois) || 0) + 1 };
  await col("clients").update(cl._id, { brief });
  await alerter({ type: "brief", icone: "clipboard-text", lien: "clients/" + cl._id, texte: cl.nom + " a rempli son brief", sous: o.texte(reponses.activite || reponses.objectifs || "", 160), email: true,
    details: BRIEF_QUESTIONS.filter((q) => reponses[q.k]).map((q) => q.label + "\n" + reponses[q.k]).join("\n\n") });
  res.json({ ok: true });
}));

/* ---------------- Avis du client ---------------- */
router.post("/:jeton/avis", route(async (req, res) => {
  entetes(res);
  const l = await resoudre(req.params.jeton);
  if (l.type !== "avis") throw o.erreur(400, "Lien inadapté");
  const b = req.body || {};
  if (b.website) return res.json({ ok: true });
  await o.limiter(req, "avis", 6);
  const texteAvis = o.texte(b.texte, 1500);
  const nom = o.texte(b.nom, 120);
  if (!nom) throw o.erreur(400, "Indiquez votre nom");
  if (texteAvis.length < 15) throw o.erreur(400, "Votre avis est un peu court : quelques phrases suffisent.");
  const note = Math.max(1, Math.min(5, Math.round(Number(b.note) || 5)));
  const cl = await col("clients").get(l.cible);
  const a = await col("avis_recus").insert({
    clientId: l.cible, nom, role: o.texte(b.role, 160), note, texte: texteAvis, autorise: b.autorise === true, statut: "a_valider",
  });
  await alerter({ type: "avis", icone: "star", lien: "clients/" + l.cible, texte: "Nouvel avis de " + nom + (cl ? " (" + cl.nom + ")" : ""),
    sous: "★".repeat(note) + " « " + texteAvis.slice(0, 120) + (texteAvis.length > 120 ? "… »" : " »"), email: true, details: texteAvis });
  res.json({ ok: true, id: String(a._id) });
}));

/* ---------------- Acceptation d'un devis ---------------- */
router.post("/:jeton/accepter", route(async (req, res) => {
  entetes(res);
  const l = await resoudre(req.params.jeton);
  if (l.type !== "document") throw o.erreur(400, "Lien inadapté");
  await o.limiter(req, "accepter", 10);
  const d = await col("documents").get(l.cible);
  if (!d || d.type !== "devis") throw o.erreur(404, "Devis introuvable");
  if (d.statut !== "envoye") throw o.erreur(409, d.statut === "accepte" ? "Ce devis est déjà accepté. Merci !" : "Ce devis ne peut plus être accepté en ligne. Contactez Paule.");
  const nom = o.texte((req.body || {}).nom, 120);
  if (!nom) throw o.erreur(400, "Indiquez votre nom pour accepter le devis");
  const n = await col("documents").update(d._id, { statut: "accepte", acceptation: { nom, date: new Date().toISOString(), enLigne: true } });
  const t = c.totaux(n);
  await alerter({ type: "devis", icone: "seal-check", lien: "clients/" + d.clientId, texte: "Devis " + d.numero + " accepté par " + nom,
    sous: (d.clientNom || "") + " · " + t.total.toLocaleString("fr-FR") + " FCFA", email: true });
  res.json({ ok: true, statut: n.statut, acceptation: n.acceptation });
}));

module.exports = { router, BRIEF_QUESTIONS };
