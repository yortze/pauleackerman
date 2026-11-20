// Back office de Paule : tableau de bord, prospects, agenda, assistants IA.
// Tout est réservé à l'admin (jeton JWT).
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const ag = require("../agenda");
const agents = require("../ai/agents");
const gagenda = require("../googleAgenda");
const compta = require("../compta");

const router = express.Router();
router.use(requireAdmin);

const enveloppe = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (!e.status) console.error("[crm]", e);
  res.status(e.status || 500).json({ erreur: e.status ? e.message : "Erreur interne : " + e.message });
});

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
const texte = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 2000);

/* -------------------------------------------------------------------------
   Tableau de bord
------------------------------------------------------------------------- */
router.get("/dashboard", enveloppe(async (_req, res) => {
  const auj = ag.aujourdhui();
  const il = (n) => ag.ajouterJours(auj, -n);
  const messages = (await col("messages").all()).filter((m) => !m.spam);
  const prospects = await col("prospects").all();
  const jourDe = (d) => ag.versLocal(d).jour;

  const parStatut = (liste, defaut) => liste.reduce((o, x) => { const s = x.statut || defaut; o[s] = (o[s] || 0) + 1; return o; }, {});
  const statsJours = await col("stats").all();
  const somme = (n) => {
    const depuis = il(n - 1);
    return statsJours.filter((s) => s.key >= depuis).reduce((o, s) => {
      Object.keys(s.compte || {}).forEach((k) => { o[k] = (o[k] || 0) + s.compte[k]; });
      return o;
    }, {});
  };
  const courbe = [];
  for (let i = 13; i >= 0; i--) {
    const j = il(i);
    const s = statsJours.find((x) => x.key === j);
    courbe.push({ jour: j, vues: (s && s.compte && s.compte.vue) || 0, demandes: messages.filter((m) => jourDe(m.createdAt) === j).length });
  }
  const rdvs = (await ag.rdvActifs()).filter((r) => new Date(r.debut).getTime() >= Date.now() - 3600000)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut)).slice(0, 6)
    .map((r) => Object.assign({}, r, { quand: ag.libelleDate(r.debut) }));
  const gagnes = messages.filter((m) => m.statut === "gagne").length + prospects.filter((p) => p.statut === "gagne").length;
  const valeurGagnee = messages.concat(prospects).filter((x) => x.statut === "gagne").reduce((s, x) => s + (Number(x.valeur) || 0), 0);

  // Clients, calendrier éditorial, argent, avis et mémoire à valider
  const [clients, planning, avisRecus, memoire, fin] = await Promise.all([
    col("clients").all(), col("planning").all(), col("avis_recus").all(), col("memoire").all(), compta.finances(auj.slice(0, 4)),
  ]);
  const nomClient = (id) => (clients.find((x) => String(x._id) === id) || {}).nom || "";
  const dans14 = ag.ajouterJours(auj, 14);
  const travail = {
    clientsActifs: clients.filter((x) => (x.statut || "actif") === "actif").length,
    aPublier: planning.filter((p) => p.date === auj && p.statut !== "publie")
      .map((p) => ({ id: String(p._id), client: nomClient(p.clientId), reseau: p.reseau, format: p.format, sujet: p.sujet || "", statut: p.statut, heure: p.heure || "" })),
    aValider: planning.filter((p) => p.statut === "a_valider").length,
    modifs: planning.filter((p) => p.statut === "creation" && p.validation && p.validation.decision === "modif")
      .map((p) => ({ id: String(p._id), client: nomClient(p.clientId), sujet: p.sujet || p.format, date: p.date })),
    renouvellements: clients.filter((x) => (x.statut || "actif") === "actif" && x.renouvellement && x.renouvellement >= auj && x.renouvellement <= dans14)
      .map((x) => ({ id: String(x._id), nom: x.nom, date: x.renouvellement })),
    avisAValider: avisRecus.filter((a) => a.statut === "a_valider").length,
    memoireAValider: memoire.filter((m) => m.statut === "proposee").length,
  };
  const argent = {
    encaisseMois: fin.moisCourant.encaisse, aEncaisser: fin.aEncaisser, enRetard: fin.enRetard, devisEnAttente: fin.devisEnAttente, recurrent: fin.recurrent,
  };

  res.json({
    aujourdhui: auj,
    demandes: {
      total: messages.length,
      nonLues: messages.filter((m) => !m.lu).length,
      semaine: messages.filter((m) => jourDe(m.createdAt) >= il(6)).length,
      mois: messages.filter((m) => jourDe(m.createdAt) >= il(29)).length,
      aAnalyser: messages.filter((m) => !m.ia).length,
      parStatut: parStatut(messages, "nouveau"),
    },
    prospects: { total: prospects.length, parStatut: parStatut(prospects, "a_contacter") },
    gagnes, valeurGagnee, travail, argent,
    aConfirmer: (await ag.rdvActifs()).filter((r) => r.statut === "a_confirmer" && new Date(r.debut).getTime() >= Date.now() - 3600000).length,
    relances: await agents.relancesJusqua(auj),
    rdvs,
    trafic: { semaine: somme(7), mois: somme(30) },
    courbe,
    ia: await agents.etatIA(),
    alertesEmail: !!(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL),
  });
}));

/* -------------------------------------------------------------------------
   Prospects (fichier de prospection)
------------------------------------------------------------------------- */
const CHAMPS_PROSPECT = ["nom", "secteur", "ville", "siteWeb", "reseaux", "contactPublic", "constat", "angle", "messageApproche", "potentiel", "statut", "notes", "relanceLe", "relanceNote", "valeur"];
function nettoyerProspect(b) {
  const o = {};
  CHAMPS_PROSPECT.forEach((k) => { if (b[k] !== undefined) o[k] = k === "valeur" ? Number(b[k]) || 0 : texte(b[k], 3000); });
  if (o.statut && agents.STATUTS.prospect.indexOf(o.statut) === -1) delete o.statut;
  if (o.relanceLe && !JOUR_RE.test(o.relanceLe)) o.relanceLe = "";
  return o;
}
router.get("/prospects", enveloppe(async (_req, res) => {
  const l = await col("prospects").all();
  l.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  res.json(l);
}));
router.post("/prospects", enveloppe(async (req, res) => {
  const p = nettoyerProspect(req.body || {});
  if (!p.nom) return res.status(400).json({ erreur: "Le nom est obligatoire" });
  res.status(201).json(await col("prospects").insert(Object.assign({ statut: "a_contacter", source: "manuel" }, p)));
}));
router.put("/prospects/:id", enveloppe(async (req, res) => {
  const d = await col("prospects").update(req.params.id, nettoyerProspect(req.body || {}));
  if (!d) return res.status(404).json({ erreur: "Introuvable" });
  res.json(d);
}));
router.delete("/prospects/:id", enveloppe(async (req, res) => {
  res.json({ ok: await col("prospects").remove(req.params.id) });
}));

/* -------------------------------------------------------------------------
   Agenda : rendez-vous et disponibilités
------------------------------------------------------------------------- */
function nettoyerRdv(b, partiel) {
  const o = {};
  ["titre", "avec", "lieu", "email", "telephone", "notes"].forEach((k) => { if (b[k] !== undefined) o[k] = texte(b[k], 2000); });
  if (b.debutLocal !== undefined) {
    const d = ag.depuisLocal(b.debutLocal);
    if (!d) { const e = new Error("Date et heure invalides"); e.status = 400; throw e; }
    o.debut = d.toISOString();
  }
  if (b.dureeMin !== undefined) o.dureeMin = Math.max(5, Math.min(480, Number(b.dureeMin) || 30));
  if (b.statut !== undefined && ["confirme", "a_confirmer", "annule", "fait"].indexOf(b.statut) !== -1) o.statut = b.statut;
  if (!partiel && !o.debut) { const e = new Error("Date et heure obligatoires"); e.status = 400; throw e; }
  return o;
}
router.get("/rdv", enveloppe(async (req, res) => {
  const du = JOUR_RE.test(req.query.du || "") ? req.query.du : ag.ajouterJours(ag.aujourdhui(), -7);
  const au = JOUR_RE.test(req.query.au || "") ? req.query.au : ag.ajouterJours(ag.aujourdhui(), 60);
  const a = ag.depuisLocal(du + "T00:00").getTime(), b = ag.depuisLocal(au + "T23:59").getTime();
  const l = (await col("rendezvous").all()).filter((r) => { const t = new Date(r.debut).getTime(); return t >= a && t <= b; })
    .sort((x, y) => new Date(x.debut) - new Date(y.debut))
    .map((r) => Object.assign({}, r, { local: ag.versLocal(r.debut), quand: ag.libelleDate(r.debut) }));
  res.json(l);
}));
router.post("/rdv", enveloppe(async (req, res) => {
  const o = nettoyerRdv(req.body || {});
  o.dureeMin = o.dureeMin || 30;
  if (ag.chevauche(new Date(o.debut).getTime(), new Date(o.debut).getTime() + o.dureeMin * 60000, await ag.rdvActifs())) {
    return res.status(409).json({ erreur: "Ce créneau chevauche un autre rendez-vous" });
  }
  const r = await col("rendezvous").insert(Object.assign({ statut: "confirme", source: "manuel", titre: "Rendez-vous" }, o));
  await gagenda.synchroniser(r);
  res.status(201).json(r);
}));
router.put("/rdv/:id", enveloppe(async (req, res) => {
  const o = nettoyerRdv(req.body || {}, true);
  if (o.debut) {
    const ancien = await col("rendezvous").get(req.params.id);
    const duree = o.dureeMin || (ancien && ancien.dureeMin) || 30;
    if (ag.chevauche(new Date(o.debut).getTime(), new Date(o.debut).getTime() + duree * 60000, await ag.rdvActifs(), req.params.id)) {
      return res.status(409).json({ erreur: "Ce créneau chevauche un autre rendez-vous" });
    }
  }
  const d = await col("rendezvous").update(req.params.id, o);
  if (!d) return res.status(404).json({ erreur: "Introuvable" });
  await gagenda.synchroniser(d);
  res.json(d);
}));
router.delete("/rdv/:id", enveloppe(async (req, res) => {
  const ok = await col("rendezvous").remove(req.params.id);
  if (ok) await gagenda.retirer(req.params.id);
  res.json({ ok });
}));

/* Google Agenda : état, test de connexion, envoi des rendez-vous à venir */
router.get("/google-agenda", enveloppe(async (_req, res) => res.json(await gagenda.etat())));
router.post("/google-agenda/tester", enveloppe(async (_req, res) => res.json(await gagenda.tester())));
router.post("/google-agenda/synchroniser", enveloppe(async (_req, res) => res.json(await gagenda.toutSynchroniser())));

router.get("/agenda-reglages", enveloppe(async (_req, res) => res.json(await ag.reglages())));
router.put("/agenda-reglages", enveloppe(async (req, res) => {
  const b = req.body || {};
  const heure = /^\d{2}:\d{2}$/;
  const patch = {
    actif: !!b.actif,
    dureeAppel: Math.max(10, Math.min(120, Number(b.dureeAppel) || 30)),
    delaiMinHeures: Math.max(0, Math.min(168, Number(b.delaiMinHeures) || 0)),
    joursAVenir: Math.max(1, Math.min(60, Number(b.joursAVenir) || 14)),
    lieuAppel: texte(b.lieuAppel, 300),
    plages: (Array.isArray(b.plages) ? b.plages : [])
      .filter((p) => p && heure.test(p.debut) && heure.test(p.fin) && p.debut < p.fin && Number(p.jour) >= 0 && Number(p.jour) <= 6)
      .map((p) => ({ jour: Number(p.jour), debut: p.debut, fin: p.fin })),
  };
  const doc = await col("settings").findOne({ key: "agenda" });
  res.json(doc ? await col("settings").update(doc._id, patch) : await col("settings").insert(Object.assign({ key: "agenda" }, patch)));
}));

/* -------------------------------------------------------------------------
   Assistants IA
------------------------------------------------------------------------- */
router.get("/ia", enveloppe(async (_req, res) => res.json(await agents.etatIA())));

// 1. Diagnostic d'une demande reçue
router.post("/ia/diagnostic/:id", enveloppe(async (req, res) => {
  const m = await col("messages").get(req.params.id);
  if (!m) return res.status(404).json({ erreur: "Message introuvable" });
  const diag = await agents.analyserMessage(m);
  const patch = { ia: diag };
  if (diag.spam && !m.spam) patch.spam = true;
  res.json(await col("messages").update(m._id, patch));
}));
// … ou des nouvelles demandes pas encore analysées (3 par lot pour rester sous le délai de Vercel)
router.post("/ia/diagnostic-lot", enveloppe(async (_req, res) => {
  const aFaire = (await col("messages").all()).filter((m) => !m.ia && !m.spam)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 3);
  const faits = [];
  for (const m of aFaire) {
    const diag = await agents.analyserMessage(m);
    faits.push(await col("messages").update(m._id, Object.assign({ ia: diag }, diag.spam ? { spam: true } : {})));
  }
  const restants = (await col("messages").all()).filter((m) => !m.ia && !m.spam).length;
  res.json({ analyses: faits.length, restants });
}));
// Audit de la présence en ligne d'un prospect
router.post("/ia/audit/:id", enveloppe(async (req, res) => {
  const p = await col("prospects").get(req.params.id);
  if (!p) return res.status(404).json({ erreur: "Prospect introuvable" });
  const audit = await agents.auditerMarque({ nom: p.nom, secteur: p.secteur, ville: p.ville, siteWeb: p.siteWeb, reseaux: p.reseaux });
  res.json(await col("prospects").update(p._id, { audit }));
}));
// 2. Prospection
router.post("/ia/prospection", enveloppe(async (req, res) => {
  const b = req.body || {};
  res.json(await agents.prospecter({ secteur: texte(b.secteur, 200), zone: texte(b.zone, 200), nombre: b.nombre, consignes: texte(b.consignes, 800) }));
}));
// 3. Agenda & relances
router.post("/ia/agenda", enveloppe(async (req, res) => {
  const b = req.body || {};
  const demande = texte(b.demande, 2000);
  if (!demande) return res.status(400).json({ erreur: "Écrivez votre demande" });
  res.json(await agents.assistantAgenda(demande, Array.isArray(b.historique) ? b.historique : []));
}));

module.exports = { router };
