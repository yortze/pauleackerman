// Équipe IA (discussions), recherche globale et fil d'activité du back office.
const express = require("express");
const { col } = require("../store");
const { requireAdmin } = require("../middleware/auth");
const ag = require("../agenda");
const agents = require("../ai/agents");

const router = express.Router();
router.use(requireAdmin);

const enveloppe = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (!e.status) console.error("[equipe]", e);
  res.status(e.status || 500).json({ erreur: e.status ? e.message : "Erreur interne : " + e.message });
});
const court = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

/* ---------------- Équipe ---------------- */
router.get("/equipe", enveloppe(async (_req, res) => res.json(await agents.equipe())));

router.get("/equipe/:agent", enveloppe(async (req, res) => {
  const liste = await agents.equipe();
  const fiche = liste.find((a) => a.agent === req.params.agent);
  if (!fiche) return res.status(404).json({ erreur: "Assistant inconnu" });
  const doc = await agents.historique(req.params.agent);
  res.json({ agent: fiche, messages: (doc && doc.messages) || [] });
}));

router.post("/equipe/:agent", enveloppe(async (req, res) => {
  const b = req.body || {};
  const contexte = b.contexte && ["message", "prospect", "rdv"].indexOf(b.contexte.type) !== -1 && /^[\w-]{1,64}$/.test(String(b.contexte.id || ""))
    ? { type: b.contexte.type, id: String(b.contexte.id) } : null;
  res.json(await agents.discuter(req.params.agent, b.texte, contexte));
}));

router.delete("/equipe/:agent", enveloppe(async (req, res) => {
  if (!agents.EQUIPE[req.params.agent]) return res.status(404).json({ erreur: "Assistant inconnu" });
  await agents.viderDiscussion(req.params.agent);
  res.json({ ok: true });
}));

/* ---------------- Débriefs d'équipe ---------------- */
const ID_RE = /^[\w-]{1,64}$/;
async function contexteValide(c) {
  if (!c || ["message", "prospect"].indexOf(c.type) === -1 || !ID_RE.test(String(c.id || ""))) return null;
  const d = await col(c.type === "message" ? "messages" : "prospects").get(String(c.id));
  return d ? { type: c.type, id: String(d._id), label: String(d.nom || "Sans nom").slice(0, 120) } : null;
}

router.get("/debriefs", enveloppe(async (_req, res) => res.json(await agents.listerDebriefs())));

// Clients qu'on peut associer à un débrief : demandes reçues (hors spam) et prospects
router.get("/debriefs-clients", enveloppe(async (_req, res) => {
  const m = (await col("messages").all()).filter((x) => !x.spam).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 80).map((x) => ({ type: "message", id: String(x._id), label: x.nom || "Anonyme", sous: court(x.besoin || x.message, 60) }));
  const p = (await col("prospects").all()).slice(-80).reverse()
    .map((x) => ({ type: "prospect", id: String(x._id), label: x.nom || "Sans nom", sous: [x.secteur, x.ville].filter(Boolean).join(" · ") }));
  res.json(m.concat(p));
}));

router.post("/debriefs", enveloppe(async (req, res) => {
  const b = req.body || {};
  res.json(await agents.creerDebrief(b.titre, await contexteValide(b.contexte)));
}));

router.get("/debriefs/:id", enveloppe(async (req, res) => {
  const d = await agents.lireDebrief(req.params.id);
  res.json(Object.assign(agents.debriefPublic(d), { messages: d.messages || [] }));
}));

router.post("/debriefs/:id", enveloppe(async (req, res) => res.json(await agents.debriefer(req.params.id, (req.body || {}).texte))));

router.delete("/debriefs/:id", enveloppe(async (req, res) => {
  await agents.lireDebrief(req.params.id);
  await col("debriefs").remove(req.params.id);
  res.json({ ok: true });
}));

/* ---------------- Bloc-notes ---------------- */
router.get("/notes", enveloppe(async (_req, res) => res.json(await agents.listerNotes())));
router.post("/notes", enveloppe(async (req, res) => {
  const b = req.body || {};
  res.json(await agents.ajouterNote({ texte: b.texte, client: b.client, echeance: b.echeance, auteur: "Paule" }));
}));
router.put("/notes/:id", enveloppe(async (req, res) => res.json(await agents.modifierNote(req.params.id, req.body || {}))));
router.delete("/notes/:id", enveloppe(async (req, res) => {
  if (!(await col("notes").remove(req.params.id))) return res.status(404).json({ erreur: "Tâche introuvable" });
  res.json({ ok: true });
}));

/* ---------------- Recherche globale (palette de commandes) ---------------- */
router.get("/recherche", enveloppe(async (req, res) => {
  const q = String(req.query.q || "").toLowerCase().trim();
  if (q.length < 2) return res.json({ resultats: [] });
  const contient = (...vals) => vals.some((v) => String(v || "").toLowerCase().indexOf(q) !== -1);
  const out = [];

  (await col("messages").all()).filter((m) => contient(m.nom, m.email, m.telephone, m.besoin, m.message, m.notes))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6)
    .forEach((m) => out.push({ type: "message", id: String(m._id), titre: m.nom || "Anonyme", sous: court(m.besoin || m.message, 80), date: m.createdAt }));

  (await col("prospects").all()).filter((p) => contient(p.nom, p.secteur, p.ville, p.contactPublic, p.notes, p.constat)).slice(0, 6)
    .forEach((p) => out.push({ type: "prospect", id: String(p._id), titre: p.nom, sous: [p.secteur, p.ville].filter(Boolean).join(" · "), date: p.createdAt }));

  (await col("rendezvous").all()).filter((r) => contient(r.titre, r.avec, r.notes, r.email)).slice(0, 6)
    .forEach((r) => out.push({ type: "rdv", id: String(r._id), titre: (r.titre || "Rendez-vous") + " · " + (r.avec || ""), sous: ag.libelleDate(r.debut), date: r.debut }));

  (await col("posts").all()).filter((p) => contient(p.texteGras, p.texte, p.tag, p.partageTexte)).slice(0, 5)
    .forEach((p) => out.push({ type: "post", id: String(p._id), titre: court(p.texteGras || p.partageTexte || p.texte, 70), sous: p.tag || "Publication" }));
  (await col("creations").all()).filter((c) => contient(c.titre, c.tag)).slice(0, 4)
    .forEach((c) => out.push({ type: "creation", id: String(c._id), titre: c.titre, sous: "Création" }));
  (await col("etudes").all()).filter((e) => contient(e.titre, e.texte)).slice(0, 4)
    .forEach((e) => out.push({ type: "etude", id: String(e._id), titre: e.titre, sous: "Étude de cas" }));

  (await col("equipe").all()).forEach((d) => {
    const fiche = agents.EQUIPE[d.agent];
    if (!fiche) return;
    const m = (d.messages || []).slice().reverse().find((x) => contient(x.texte));
    if (m) out.push({ type: "equipe", id: d.agent, titre: fiche.prenom + " · " + fiche.poste, sous: court(m.texte, 90), date: m.date });
  });
  res.json({ resultats: out });
}));

/* ---------------- Fil d'activité (notifications) ---------------- */
const ACTIONS_IA = {
  "analyse d’une demande": "a analysé une demande",
  "audit d’une marque": "a audité un prospect",
  "recherche de prospects": "a cherché de nouveaux prospects",
  "assistant agenda": "a mis à jour l’agenda",
  discussion: "vous a répondu",
  "débrief d’équipe": "a participé à un débrief",
};
router.get("/activite", enveloppe(async (_req, res) => {
  const ev = [];
  (await col("messages").all()).filter((m) => !m.spam).slice(-20).forEach((m) => ev.push({
    type: "message", id: String(m._id), date: m.createdAt, icone: "chat-circle-text",
    texte: `Nouvelle demande de ${m.nom || "Anonyme"}`, sous: court(m.besoin || m.message, 70), nonLu: !m.lu,
  }));
  (await col("rendezvous").all()).filter((r) => r.source === "site").slice(-12).forEach((r) => ev.push({
    type: "rdv", id: String(r._id), date: r.createdAt, icone: "calendar-check",
    texte: `${r.avec || "Un visiteur"} a réservé un appel`, sous: ag.libelleDate(r.debut) + (r.statut === "a_confirmer" ? " · à confirmer" : ""), nonLu: r.statut === "a_confirmer",
  }));
  (await col("prospects").all()).filter((p) => p.source === "IA").slice(-12).forEach((p) => ev.push({
    type: "prospect", id: String(p._id), date: p.createdAt, icone: "target", agent: "prospection",
    texte: `Yann a ajouté ${p.nom} à vos prospects`, sous: [p.secteur, p.ville].filter(Boolean).join(" · "),
  }));
  (await col("ia_runs").all()).slice(-25).forEach((r) => {
    const fiche = agents.EQUIPE[r.agent];
    if (!fiche) return;
    ev.push({
      type: "ia", id: r.agent, date: r.createdAt, icone: r.ok ? "sparkle" : "warning-circle", agent: r.agent,
      texte: `${fiche.prenom} ${r.ok ? (ACTIONS_IA[r.tache] || r.tache) : "n’a pas pu terminer : " + court(r.detail, 60)}`,
      sous: r.ok ? court(r.detail, 70) : "", echec: !r.ok,
    });
  });
  ev.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  res.json({ evenements: ev.slice(0, 40) });
}));

module.exports = { router };
