// Clients, devis et factures, paiements, coûts et finances. Réservé à l'admin.
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const o = require("../outils");
const c = require("../compta");

const router = express.Router();
router.use(requireAdmin);
const route = o.enveloppe("clients");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* =========================================================================
   Clients
========================================================================= */
const CHAMPS_CLIENT = { nom: 120, entreprise: 160, contact: 120, secteur: 120, ville: 120, adresse: 300, telephone: 40, email: 200, formule: 200, reseaux: 1500, ton: 4000, notes: 6000 };
function nettoyerClient(b, partiel) {
  const x = {};
  Object.keys(CHAMPS_CLIENT).forEach((k) => { if (b[k] !== undefined) x[k] = o.texte(b[k], CHAMPS_CLIENT[k]); });
  if (b.montantMensuel !== undefined) x.montantMensuel = o.montant(b.montantMensuel);
  ["debutContrat", "renouvellement"].forEach((k) => { if (b[k] !== undefined) x[k] = o.jour(b[k]); });
  if (b.statut !== undefined) x.statut = o.choix(b.statut, c.STATUTS_CLIENT, "actif");
  if (x.email && !EMAIL_RE.test(x.email)) throw o.erreur(400, "Email invalide");
  if ((!partiel || x.nom !== undefined) && !x.nom) throw o.erreur(400, "Le nom du client est obligatoire");
  return x;
}
async function clientOu404(id) {
  const d = o.ID_RE.test(String(id || "")) ? await col("clients").get(id) : null;
  if (!d) throw o.erreur(404, "Client introuvable");
  return d;
}

router.get("/clients", route(async (_req, res) => {
  const auj = o.aujourdhui();
  const [clients, docs, planning] = await Promise.all([col("clients").all(), col("documents").all(), col("planning").all()]);
  const liste = clients.map((cl) => {
    const id = String(cl._id);
    const factures = docs.filter((d) => d.clientId === id && d.type === "facture" && (d.statut === "envoyee" || d.statut === "partielle"));
    const posts = planning.filter((p) => p.clientId === id);
    const avenir = posts.filter((p) => p.date >= auj && p.statut !== "publie").sort((a, b) => a.date.localeCompare(b.date));
    return Object.assign({}, cl, {
      resume: {
        aEncaisser: factures.reduce((s, f) => s + c.totaux(f).reste, 0),
        enRetard: factures.some((f) => c.enRetard(f, auj)),
        aValider: posts.filter((p) => p.statut === "a_valider").length,
        prochaine: avenir.length ? avenir[0].date : "",
        renouvellementProche: !!cl.renouvellement && cl.renouvellement >= auj && cl.renouvellement <= addJours(auj, 14),
      },
    });
  });
  const ordre = { actif: 0, pause: 1, termine: 2 };
  liste.sort((a, b) => (ordre[a.statut || "actif"] - ordre[b.statut || "actif"]) || String(a.nom).localeCompare(String(b.nom), "fr"));
  res.json(liste);
}));

function addJours(j, n) { const d = new Date(j + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

router.get("/clients/:id", route(async (req, res) => {
  const cl = await clientOu404(req.params.id);
  const id = String(cl._id);
  const auj = o.aujourdhui();
  const [docs, planning, rapports, avis, couts, liens] = await Promise.all([
    col("documents").all(), col("planning").all(), col("rapports").all(), col("avis_recus").all(), col("couts").all(), col("liens").all(),
  ]);
  const lien = (type) => { const l = liens.find((x) => x.type === type && x.cible === id); return l ? l.jeton : ""; };
  const reglages = await o.reglage("facturation", c.FACTURATION_DEFAUT);
  const sesCouts = couts.filter((x) => x.clientId === id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const sesDocs = docs.filter((d) => d.clientId === id).map((d) => c.avecTotaux(d, auj)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const encaisse = sesDocs.filter((d) => d.type === "facture").reduce((s, d) => s + d.totaux.paye, 0);
  const coutTotal = sesCouts.reduce((s, x) => s + c.coutDe(x, reglages.tauxHoraire), 0);
  res.json({
    client: cl,
    documents: sesDocs,
    planning: planning.filter((p) => p.clientId === id).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 120),
    rapports: rapports.filter((r) => r.clientId === id).map((r) => ({ _id: r._id, mois: r.mois, titre: r.titre, redigeLe: r.redigeLe, createdAt: r.createdAt }))
      .sort((a, b) => String(b.mois).localeCompare(String(a.mois))),
    avis: avis.filter((a) => a.clientId === id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    couts: sesCouts.slice(0, 100),
    liens: { validation: lien("validation"), brief: lien("brief"), avis: lien("avis") },
    resume: {
      encaisse, couts: coutTotal, marge: encaisse - coutTotal,
      aEncaisser: sesDocs.filter((d) => d.type === "facture" && (d.statut === "envoyee" || d.statut === "partielle")).reduce((s, d) => s + d.totaux.reste, 0),
      heures: sesCouts.filter((x) => x.type === "temps").reduce((s, x) => s + (Number(x.heures) || 0), 0),
    },
  });
}));

router.post("/clients", route(async (req, res) => {
  const x = nettoyerClient(req.body || {});
  res.status(201).json(await col("clients").insert(Object.assign({ statut: "actif", debutContrat: o.aujourdhui() }, x)));
}));
router.put("/clients/:id", route(async (req, res) => {
  await clientOu404(req.params.id);
  res.json(await col("clients").update(req.params.id, nettoyerClient(req.body || {}, true)));
}));
router.delete("/clients/:id", route(async (req, res) => {
  const cl = await clientOu404(req.params.id);
  const id = String(cl._id);
  const emis = (await col("documents").all()).some((d) => d.clientId === id && d.statut !== "brouillon");
  if (emis) throw o.erreur(409, "Ce client a des devis ou des factures émis : passez-le plutôt en « Terminé » pour garder l’historique.");
  for (const nom of ["documents", "planning", "rapports", "avis_recus", "couts"]) {
    for (const d of (await col(nom).all()).filter((x) => x.clientId === id)) {
      await col(nom).remove(d._id);
      await o.supprimerLiens(d._id);
    }
  }
  await o.supprimerLiens(id);
  await col("clients").remove(id);
  res.json({ ok: true });
}));

/** Fiche client créée depuis une demande reçue ou un prospect gagné. */
router.post("/clients/depuis", route(async (req, res) => {
  const b = req.body || {};
  const type = o.choix(b.type, ["message", "prospect"], "");
  if (!type || !o.ID_RE.test(String(b.id || ""))) throw o.erreur(400, "Origine invalide");
  const nomCol = type === "message" ? "messages" : "prospects";
  const lead = await col(nomCol).get(String(b.id));
  if (!lead) throw o.erreur(404, "Contact introuvable");
  if (lead.clientId) {
    const deja = await col("clients").get(lead.clientId);
    if (deja) return res.json(deja);
  }
  const contact = type === "message" ? { telephone: lead.telephone || "", email: lead.email || "" } : {
    telephone: (String(lead.contactPublic || "").match(/(\+?\d[\d .()-]{7,}\d)/) || [])[1] || "",
    email: (String(lead.contactPublic || "").match(/[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i) || [])[0] || "",
  };
  const notes = type === "message"
    ? [lead.besoin && "Besoin : " + lead.besoin, lead.budget && "Budget : " + lead.budget, lead.message && "Premier message : " + lead.message].filter(Boolean).join("\n")
    : [lead.constat && "Constat : " + lead.constat, lead.angle && "Angle : " + lead.angle, lead.notes].filter(Boolean).join("\n");
  const cl = await col("clients").insert(Object.assign({
    nom: o.texte(lead.nom || "Nouveau client", 120),
    secteur: o.texte(lead.secteur || lead.besoin || "", 120),
    ville: o.texte(lead.ville || "Libreville", 120),
    reseaux: o.texte([lead.siteWeb, lead.reseaux].filter(Boolean).join("\n"), 1500),
    montantMensuel: o.montant(lead.valeur),
    notes: o.texte(notes, 6000),
    statut: "actif",
    debutContrat: o.aujourdhui(),
    source: { type, id: String(lead._id) },
  }, contact));
  await col(nomCol).update(lead._id, { clientId: String(cl._id), statut: type === "message" ? "gagne" : "gagne" });
  await o.evenement("client", "Nouveau client : " + cl.nom, "Créé depuis " + (type === "message" ? "une demande reçue" : "un prospect"), "clients/" + cl._id, "handshake");
  res.status(201).json(cl);
}));

/** Lien public d'un client : validation des publications, brief ou avis. */
router.post("/clients/:id/liens/:type", route(async (req, res) => {
  const cl = await clientOu404(req.params.id);
  const type = o.choix(req.params.type, ["validation", "brief", "avis"], "");
  if (!type) throw o.erreur(400, "Type de lien inconnu");
  res.json({ jeton: await o.lienPour(type, cl._id, cl._id, !!(req.body || {}).nouveau) });
}));

/* =========================================================================
   Devis et factures
========================================================================= */
function nettoyerLignes(l) {
  return (Array.isArray(l) ? l : []).slice(0, 40).map((x) => ({
    designation: o.texte(x && x.designation, 500),
    quantite: Math.max(0, Math.min(100000, Math.round((Number(x && x.quantite) || 0) * 100) / 100)),
    prixUnitaire: o.montant(x && x.prixUnitaire),
  })).filter((x) => x.designation || x.prixUnitaire);
}
function nettoyerDocument(b) {
  const x = {};
  if (b.objet !== undefined) x.objet = o.texte(b.objet, 300);
  if (b.lignes !== undefined) x.lignes = nettoyerLignes(b.lignes);
  if (b.remise !== undefined) x.remise = o.montant(b.remise);
  if (b.tva !== undefined) x.tva = Math.max(0, Math.min(30, Number(b.tva) || 0));
  if (b.acompte !== undefined) x.acompte = Math.max(0, Math.min(100, Math.round(Number(b.acompte) || 0)));
  if (b.echeance !== undefined) x.echeance = o.jour(b.echeance);
  if (b.dateEmission !== undefined) x.dateEmission = o.jour(b.dateEmission);
  if (b.notes !== undefined) x.notes = o.texte(b.notes, 3000);
  return x;
}
async function documentOu404(id) {
  const d = o.ID_RE.test(String(id || "")) ? await col("documents").get(id) : null;
  if (!d) throw o.erreur(404, "Document introuvable");
  return d;
}
async function avecLien(d) {
  const l = await o.lienDe("document", d._id);
  return Object.assign(c.avecTotaux(d), { lien: l ? l.jeton : "" });
}
/** Crée un brouillon de devis ou de facture (utilisé aussi par Awa). */
async function creerDocument(type, clientId, champs) {
  type = o.choix(type, ["devis", "facture"], "");
  if (!type) throw o.erreur(400, "Type de document inconnu (devis ou facture)");
  const cl = await clientOu404(clientId);
  const r = await o.reglage("facturation", c.FACTURATION_DEFAUT);
  const auj = o.aujourdhui();
  const x = nettoyerDocument(champs || {});
  return col("documents").insert(Object.assign({
    type, clientId: String(cl._id), clientNom: cl.nom, statut: "brouillon", numero: "",
    objet: type === "devis" ? "Devis" : "Facture", lignes: [], remise: 0, tva: Number(r.tva) || 0,
    acompte: type === "devis" ? Number(r.acompte) || 0 : 0,
    echeance: addJours(auj, type === "devis" ? Number(r.validiteDevis) || 30 : Number(r.delaiPaiement) || 15),
    notes: "", paiements: [],
  }, x));
}

router.get("/documents", route(async (req, res) => {
  const auj = o.aujourdhui();
  let l = await col("documents").all();
  if (req.query.type) l = l.filter((d) => d.type === req.query.type);
  if (req.query.client) l = l.filter((d) => d.clientId === String(req.query.client));
  res.json(l.map((d) => c.avecTotaux(d, auj)).sort((a, b) => String(b.dateEmission || b.createdAt).localeCompare(String(a.dateEmission || a.createdAt))));
}));
router.get("/documents/:id", route(async (req, res) => {
  const d = await documentOu404(req.params.id);
  res.json(await avecLien(d));
}));
router.post("/documents", route(async (req, res) => {
  const b = req.body || {};
  res.status(201).json(await avecLien(await creerDocument(b.type, b.clientId, b)));
}));
router.put("/documents/:id", route(async (req, res) => {
  const d = await documentOu404(req.params.id);
  const x = nettoyerDocument(req.body || {});
  if (d.statut !== "brouillon") {
    // Un document émis garde ses montants ; seules ses notes et son échéance changent
    ["lignes", "remise", "tva", "acompte", "objet", "dateEmission"].forEach((k) => delete x[k]);
  }
  res.json(await avecLien(await col("documents").update(d._id, x)));
}));
router.delete("/documents/:id", route(async (req, res) => {
  const d = await documentOu404(req.params.id);
  if (d.statut !== "brouillon") throw o.erreur(409, d.type === "facture" ? "Une facture émise ne se supprime pas : annulez-la." : "Un devis envoyé ne se supprime pas : marquez-le refusé.");
  await col("documents").remove(d._id);
  await o.supprimerLiens(d._id);
  res.json({ ok: true });
}));

/** Émission : numéro définitif, date, lien de consultation pour le client. */
router.post("/documents/:id/emettre", route(async (req, res) => {
  const d = await documentOu404(req.params.id);
  if (d.statut !== "brouillon") return res.json(await avecLien(d));
  if (!(d.lignes || []).length || c.totaux(d).total <= 0) throw o.erreur(400, "Ajoutez au moins une ligne avec un montant avant d’émettre.");
  const auj = o.aujourdhui();
  const patch = {
    numero: await c.prochainNumero(d.type, (d.dateEmission || auj).slice(0, 4)),
    dateEmission: d.dateEmission || auj,
    statut: d.type === "devis" ? "envoye" : "envoyee",
  };
  const n = await col("documents").update(d._id, patch);
  await o.lienPour("document", n._id, n.clientId);
  res.json(await avecLien(n));
}));

router.post("/documents/:id/statut", route(async (req, res) => {
  const d = await documentOu404(req.params.id);
  const s = String((req.body || {}).statut || "");
  if (d.statut === "brouillon") throw o.erreur(409, "Émettez d’abord le document.");
  const permis = d.type === "devis" ? ["envoye", "accepte", "refuse"] : ["annulee", "envoyee"];
  if (permis.indexOf(s) === -1) throw o.erreur(400, "Statut impossible pour ce document");
  const patch = { statut: d.type === "facture" && s === "envoyee" ? c.statutFacture(Object.assign({}, d, { statut: "envoyee" })) : s };
  if (s === "accepte" && !d.acceptation) patch.acceptation = { nom: "Paule (marqué à la main)", date: new Date().toISOString() };
  res.json(await avecLien(await col("documents").update(d._id, patch)));
}));

router.post("/documents/:id/paiements", route(async (req, res) => {
  const d = await documentOu404(req.params.id);
  if (d.type !== "facture" || d.statut === "brouillon" || d.statut === "annulee") throw o.erreur(409, "Les paiements s’enregistrent sur une facture émise.");
  const b = req.body || {};
  const p = { date: o.jour(b.date) || o.aujourdhui(), montant: o.montant(b.montant), mode: o.choix(b.mode, c.MODES_PAIEMENT, "Autre"), note: o.texte(b.note, 300) };
  if (!p.montant) throw o.erreur(400, "Indiquez le montant reçu");
  const paiements = (d.paiements || []).concat([p]).slice(-60);
  const n = Object.assign({}, d, { paiements });
  res.json(await avecLien(await col("documents").update(d._id, { paiements, statut: c.statutFacture(n) })));
}));
router.delete("/documents/:id/paiements/:i", route(async (req, res) => {
  const d = await documentOu404(req.params.id);
  const i = Number(req.params.i);
  const paiements = (d.paiements || []).filter((_, k) => k !== i);
  const n = Object.assign({}, d, { paiements });
  res.json(await avecLien(await col("documents").update(d._id, { paiements, statut: c.statutFacture(n) })));
}));

/** Facture tirée d'un devis : totalité, acompte ou solde. */
router.post("/documents/:id/facturer", route(async (req, res) => {
  const devis = await documentOu404(req.params.id);
  if (devis.type !== "devis") throw o.erreur(400, "Seul un devis se transforme en facture");
  if (devis.statut === "brouillon") throw o.erreur(409, "Émettez d’abord le devis");
  const mode = o.choix((req.body || {}).mode, ["total", "acompte", "solde"], "total");
  const t = c.totaux(devis);
  const ref = devis.numero ? " (devis " + devis.numero + ")" : "";
  let champs;
  if (mode === "acompte") {
    const pct = devis.acompte || 50;
    champs = { objet: "Acompte de " + pct + " %" + ref, lignes: [{ designation: "Acompte de " + pct + " % — " + (devis.objet || "prestation") + ref, quantite: 1, prixUnitaire: Math.round((t.base * pct) / 100) }], tva: devis.tva };
  } else {
    const acomptes = (await col("documents").all()).filter((f) => f.type === "facture" && f.devisId === String(devis._id) && f.statut !== "annulee" && /^Acompte/.test(f.objet || ""));
    const deja = acomptes.reduce((s, f) => s + c.totaux(f).base, 0);
    champs = {
      objet: (mode === "solde" ? "Solde — " : "") + (devis.objet || "Prestation") + ref,
      lignes: devis.lignes, remise: (devis.remise || 0) + (mode === "solde" ? deja : 0), tva: devis.tva,
      notes: mode === "solde" && deja ? "Acompte(s) déjà facturé(s) déduit(s) : " + deja.toLocaleString("fr-FR") + " FCFA HT." : "",
    };
  }
  const f = await creerDocument("facture", devis.clientId, champs);
  const n = await col("documents").update(f._id, { devisId: String(devis._id) });
  if (devis.statut === "envoye") await col("documents").update(devis._id, { statut: "accepte", acceptation: devis.acceptation || { nom: "Paule (facturé)", date: new Date().toISOString() } });
  res.status(201).json(await avecLien(n));
}));

router.post("/documents/:id/dupliquer", route(async (req, res) => {
  const d = await documentOu404(req.params.id);
  const n = await creerDocument(d.type, d.clientId, { objet: d.objet, lignes: d.lignes, remise: d.remise, tva: d.tva, acompte: d.acompte, notes: d.notes });
  res.status(201).json(await avecLien(n));
}));

/** Factures du mois : un brouillon par client actif avec un montant mensuel. */
router.post("/documents/facturer-mois", route(async (req, res) => {
  const mois = o.MOIS_RE.test(String((req.body || {}).mois || "")) ? req.body.mois : o.aujourdhui().slice(0, 7);
  const libelle = new Date(mois + "-15T12:00:00Z").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const [clients, docs] = await Promise.all([col("clients").all(), col("documents").all()]);
  const crees = [];
  for (const cl of clients.filter((x) => (x.statut || "actif") === "actif" && Number(x.montantMensuel) > 0)) {
    const id = String(cl._id);
    if (docs.some((d) => d.type === "facture" && d.clientId === id && d.mois === mois && d.statut !== "annulee")) continue;
    const f = await creerDocument("facture", id, {
      objet: (cl.formule || "Gestion des réseaux sociaux") + " — " + libelle,
      lignes: [{ designation: (cl.formule || "Gestion des réseaux sociaux") + " — " + libelle, quantite: 1, prixUnitaire: cl.montantMensuel }],
    });
    crees.push(await col("documents").update(f._id, { mois }));
  }
  res.json({ mois, crees: crees.length, documents: crees.map((d) => c.avecTotaux(d)) });
}));

/* =========================================================================
   Coûts (frais et temps passé), finances, réglages de facturation
========================================================================= */
router.get("/couts", route(async (req, res) => {
  let l = await col("couts").all();
  if (req.query.client) l = l.filter((x) => x.clientId === String(req.query.client));
  if (/^\d{4}$/.test(String(req.query.annee || ""))) l = l.filter((x) => String(x.date || "").indexOf(req.query.annee) === 0);
  res.json(l.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 500));
}));
router.post("/couts", route(async (req, res) => {
  const b = req.body || {};
  const x = {
    date: o.jour(b.date) || o.aujourdhui(),
    type: o.choix(b.type, ["frais", "temps"], "frais"),
    libelle: o.texte(b.libelle, 200),
    montant: o.montant(b.montant),
    heures: Math.max(0, Math.min(1000, Math.round((Number(String(b.heures || "").replace(",", ".")) || 0) * 100) / 100)),
    clientId: o.ID_RE.test(String(b.clientId || "")) ? String(b.clientId) : "",
  };
  if (!x.libelle) x.libelle = x.type === "temps" ? "Temps de travail" : "Frais";
  if (x.type === "frais" && !x.montant) throw o.erreur(400, "Indiquez le montant de la dépense");
  if (x.type === "temps" && !x.heures) throw o.erreur(400, "Indiquez le nombre d’heures");
  res.status(201).json(await col("couts").insert(x));
}));
router.delete("/couts/:id", route(async (req, res) => {
  if (!o.ID_RE.test(req.params.id)) throw o.erreur(404, "Introuvable");
  res.json({ ok: await col("couts").remove(req.params.id) });
}));

router.get("/finances", route(async (req, res) => res.json(await c.finances(req.query.annee))));

router.get("/facturation", route(async (_req, res) => res.json(await o.reglage("facturation", c.FACTURATION_DEFAUT))));
router.put("/facturation", route(async (req, res) => {
  const b = req.body || {};
  const x = {};
  ["raisonSociale", "adresse", "telephone", "email", "nif", "rccm"].forEach((k) => { if (b[k] !== undefined) x[k] = o.texte(b[k], 300); });
  ["paiement", "mentions"].forEach((k) => { if (b[k] !== undefined) x[k] = o.texte(b[k], 1500); });
  if (b.tva !== undefined) x.tva = Math.max(0, Math.min(30, Number(b.tva) || 0));
  if (b.acompte !== undefined) x.acompte = Math.max(0, Math.min(100, Math.round(Number(b.acompte) || 0)));
  if (b.validiteDevis !== undefined) x.validiteDevis = Math.max(1, Math.min(180, Math.round(Number(b.validiteDevis) || 30)));
  if (b.delaiPaiement !== undefined) x.delaiPaiement = Math.max(0, Math.min(120, Math.round(Number(b.delaiPaiement) || 0)));
  if (b.tauxHoraire !== undefined) x.tauxHoraire = o.montant(b.tauxHoraire);
  await o.majReglage("facturation", x);
  res.json(await o.reglage("facturation", c.FACTURATION_DEFAUT));
}));

module.exports = { router, creerDocument };
