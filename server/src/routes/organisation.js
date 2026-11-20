// Organisation de l'équipe : mémoire partagée des assistantes, retours de Paule
// sur leurs réponses, leçons des affaires, raccourcis de demandes et modèles
// de messages pour les clients. Réservé à l'admin.
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const o = require("../outils");
const agents = require("../ai/agents");
const memoire = require("../ai/memoire");

const router = express.Router();
router.use(requireAdmin);
const route = o.enveloppe("organisation");

/* ---------------- Mémoire de l'équipe ---------------- */
router.get("/memoire", route(async (_req, res) => {
  const l = await col("memoire").all();
  const ordre = { proposee: 0, active: 1 };
  l.sort((a, b) => (ordre[a.statut] - ordre[b.statut]) || ((b.epingle ? 1 : 0) - (a.epingle ? 1 : 0)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ notes: l, libelles: memoire.LIBELLES });
}));
router.post("/memoire", route(async (req, res) => {
  const b = req.body || {};
  const n = await memoire.ajouterDePaule(b.texte, b.categorie || "preference", b.client, "");
  if (!n) throw o.erreur(400, "Écrivez ce que l’équipe doit retenir");
  res.status(201).json(n);
}));
router.put("/memoire/:id", route(async (req, res) => {
  const n = o.ID_RE.test(req.params.id) ? await col("memoire").get(req.params.id) : null;
  if (!n) throw o.erreur(404, "Note introuvable");
  const b = req.body || {};
  const x = {};
  if (b.texte !== undefined) { x.texte = o.texte(b.texte, 400); if (x.texte.length < 4) throw o.erreur(400, "Note trop courte"); }
  if (b.categorie !== undefined) x.categorie = o.choix(b.categorie, memoire.CATEGORIES, n.categorie || "fait");
  if (b.client !== undefined) x.client = o.texte(b.client, 120);
  if (b.epingle !== undefined) x.epingle = !!b.epingle;
  if (b.statut === "active") { x.statut = "active"; x.valideeLe = new Date().toISOString(); }
  res.json(await col("memoire").update(n._id, x));
}));
/** État d'une note (une proposition affichée dans une discussion a pu être traitée depuis). */
router.get("/memoire/:id", route(async (req, res) => {
  const n = o.ID_RE.test(req.params.id) ? await col("memoire").get(req.params.id) : null;
  if (!n) throw o.erreur(404, "Note introuvable");
  res.json({ id: String(n._id), statut: n.statut, texte: n.texte });
}));
router.delete("/memoire/:id", route(async (req, res) => {
  if (!o.ID_RE.test(req.params.id)) throw o.erreur(404, "Introuvable");
  // « Non » sur une proposition : ne jamais effacer une note que Paule a déjà retenue
  if (req.query.si === "proposee") {
    const n = await col("memoire").get(req.params.id);
    if (!n) throw o.erreur(404, "Déjà écartée");
    if (n.statut !== "proposee") throw o.erreur(409, "Déjà retenue : retirez-la depuis la mémoire de l’équipe");
  }
  res.json({ ok: await col("memoire").remove(req.params.id) });
}));
/** Awa tire la leçon d'une affaire gagnée ou perdue (propositions à valider). */
router.post("/memoire/bilan", route(async (req, res) => {
  const b = req.body || {};
  const type = o.choix(b.type, ["message", "prospect"], "");
  if (!type || !o.ID_RE.test(String(b.id || ""))) throw o.erreur(400, "Affaire invalide");
  res.json(await agents.tirerLecon(type, String(b.id)));
}));

/* ---------------- Retours de Paule sur une réponse ---------------- */
function lireRetour(b) {
  const note = o.choix(b.note, ["bien", "corriger"], "");
  if (!note) throw o.erreur(400, "Retour inconnu");
  if (typeof b.date !== "string" || !b.date) throw o.erreur(400, "Message introuvable");
  return { note, texte: o.texte(b.texte, 400), date: b.date };
}
router.post("/equipe/:agent/retour", route(async (req, res) => {
  if (!agents.EQUIPE[req.params.agent] || !Object.prototype.hasOwnProperty.call(agents.EQUIPE, req.params.agent)) throw o.erreur(404, "Assistante inconnue");
  const r = lireRetour(req.body || {});
  res.json(await agents.retourDiscussion(req.params.agent, r.date, r.note, r.texte));
}));
router.post("/debriefs/:id/retour", route(async (req, res) => {
  const b = req.body || {};
  const r = lireRetour(b);
  const agent = agents.ORDRE.indexOf(b.agent) !== -1 ? b.agent : "";
  res.json(await agents.retourDebrief(req.params.id, r.date, agent, r.note, r.texte));
}));

/* ---------------- Raccourcis (demandes toutes prêtes) ---------------- */
const RACCOURCIS_DEFAUT = [
  { agent: "prospection", titre: "Audit avec captures", texte: "Voici les captures du compte de [marque]. Fais l’audit complet et prépare un message d’approche." },
  { agent: "prospection", titre: "Chercher des prospects", texte: "Trouve-moi 5 [secteur] à Libreville qui ont besoin d’une social media manager." },
  { agent: "contenu", titre: "Légendes", texte: "Écris 3 légendes pour un [format] [réseau] de [client] sur [sujet]." },
  { agent: "contenu", titre: "Planning du mois", texte: "Propose 8 publications pour [client] en [mois], avec une légende pour chacune, et ajoute-les au calendrier." },
  { agent: "contenu", titre: "Script de vidéo", texte: "Écris un script de Reel de 30 secondes pour [client] sur [sujet]." },
  { agent: "agenda", titre: "Point du jour", texte: "Fais-moi le point de ma journée : rendez-vous, relances, publications et factures." },
  { agent: "agenda", titre: "Prix d’un projet", texte: "[client] veut [besoin]. Quel prix proposer, avec quelle marge ? Prépare le devis en brouillon." },
  { agent: "diagnostic", titre: "Réponse à une demande", texte: "Analyse la dernière demande reçue et prépare-moi une réponse WhatsApp." },
  { agent: "tous", titre: "Relance", texte: "Prépare une relance courte et chaleureuse pour [client], qui n’a pas répondu depuis [nombre] jours." },
];
const MODELES_DEFAUT = [
  { titre: "Bienvenue", texte: "Bonjour {contact}, ravie de commencer à travailler avec {client} ! Je vous envoie la suite très vite. N’hésitez pas à m’écrire ici sur WhatsApp." },
  { titre: "Questionnaire de brief", texte: "Bonjour {contact}, pour bien démarrer, pouvez-vous remplir ce court questionnaire sur votre marque ? {lien_brief}" },
  { titre: "Publications à valider", texte: "Bonjour {contact}, vos prochaines publications sont prêtes. Vous pouvez les valider ici : {lien_validation}" },
  { titre: "Confirmation de rendez-vous", texte: "Bonjour {contact}, c’est Paule. Je vous confirme notre rendez-vous du [date] à [heure]. À très vite !" },
  { titre: "Relance d’un devis", texte: "Bonjour {contact}, je reviens vers vous au sujet du devis que je vous ai envoyé. Avez-vous eu le temps de le regarder ? Je reste disponible pour en parler." },
  { titre: "Rappel de paiement", texte: "Bonjour {contact}, petit rappel : la facture [numéro] arrive à échéance le [date]. Merci beaucoup !" },
  { titre: "Renouvellement", texte: "Bonjour {contact}, notre collaboration arrive à son renouvellement le {renouvellement}. On fait le point ensemble cette semaine ?" },
  { titre: "Demande d’avis", texte: "Bonjour {contact}, merci encore pour votre confiance ! Accepteriez-vous de laisser un petit avis sur notre collaboration ? Ça prend une minute : {lien_avis}" },
];

/** Liste simple { titre, texte, … } avec ses valeurs par défaut au premier usage. */
function listeEditable(nomCol, defauts, extra) {
  const cle = "init_" + nomCol;
  async function tous() {
    let l = await col(nomCol).all();
    if (!l.length && !(await col("settings").findOne({ key: cle }))) {
      for (const [i, d] of defauts.entries()) await col(nomCol).insert(Object.assign({ ordre: i + 1 }, d));
      await col("settings").insert({ key: cle, le: new Date().toISOString() });
      l = await col(nomCol).all();
    }
    return l.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  }
  function nettoyer(b) {
    const x = {};
    if (b.titre !== undefined) x.titre = o.texte(b.titre, 80);
    if (b.texte !== undefined) x.texte = o.texte(b.texte, 2000);
    Object.assign(x, extra ? extra(b) : {});
    return x;
  }
  router.get("/" + nomCol, route(async (_req, res) => res.json(await tous())));
  router.post("/" + nomCol, route(async (req, res) => {
    const x = nettoyer(req.body || {});
    if (!x.titre || !x.texte) throw o.erreur(400, "Donnez un titre et un texte");
    const l = await tous();
    res.status(201).json(await col(nomCol).insert(Object.assign({ ordre: l.reduce((m, y) => Math.max(m, y.ordre || 0), 0) + 1 }, x)));
  }));
  router.put("/" + nomCol + "/:id", route(async (req, res) => {
    if (!o.ID_RE.test(req.params.id)) throw o.erreur(404, "Introuvable");
    const d = await col(nomCol).update(req.params.id, nettoyer(req.body || {}));
    if (!d) throw o.erreur(404, "Introuvable");
    res.json(d);
  }));
  router.delete("/" + nomCol + "/:id", route(async (req, res) => {
    if (!o.ID_RE.test(req.params.id)) throw o.erreur(404, "Introuvable");
    res.json({ ok: await col(nomCol).remove(req.params.id) });
  }));
}
listeEditable("raccourcis", RACCOURCIS_DEFAUT, (b) => (b.agent !== undefined ? { agent: o.choix(b.agent, ["tous"].concat(agents.ORDRE), "tous") } : {}));
listeEditable("modeles", MODELES_DEFAUT);

module.exports = { router };
