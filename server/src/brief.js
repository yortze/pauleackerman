// Brief du matin : chaque jour vers 7 h (heure de Libreville), un email à Paule
// avec sa journée — rendez-vous, publications, relances, demandes non lues,
// retours des clients, factures en retard, renouvellements. Déclenché par la
// tâche planifiée de Vercel (vercel.json → crons → /api/cron/brief).
const { col } = require("./store");
const ag = require("./agenda");
const compta = require("./compta");
const o = require("./outils");
const { notifier } = require("./notify");

const CLE = "brief_matin";
const DEFAUTS = { actif: true, siVide: false, dernierJour: "", dernierLe: "", dernierResultat: "" };
const ETAPES = { idee: "encore à l’état d’idée", creation: "en création", a_valider: "attend la validation du client", valide: "validée, prête à publier" };

const site = () => (process.env.SITE_URL || "https://www.pauleackerman.com").replace(/\/+$/, "");
const escHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fcfa = (n) => (Number(n) || 0).toLocaleString("fr-FR").replace(/[  ]/g, " ") + " FCFA";
const court = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const jourCourt = (j) => new Date(j + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const pluriel = (n, un, plusieurs) => n + " " + (n > 1 ? plusieurs : un);

async function reglages() {
  const r = await o.reglage(CLE, DEFAUTS);
  return { actif: r.actif !== false, siVide: !!r.siVide, dernierJour: r.dernierJour || "", dernierLe: r.dernierLe || "", dernierResultat: r.dernierResultat || "" };
}
const emailConfigure = () => !!(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL);

/** Contenu du brief d'un jour : { jour, sujet, chapeau, sections, vide, texte, html }. */
async function composer(jourIso) {
  const jour = o.JOUR_RE.test(String(jourIso || "")) ? jourIso : ag.aujourdhui();
  const dans7 = ag.ajouterJours(jour, 7);
  const [rdvs, relances, messages, planning, clients, docs, fin, avisRecus, memoire, profil] = await Promise.all([
    ag.rdvActifs(), require("./ai/agents").relancesJusqua(jour), col("messages").all(), col("planning").all(), col("clients").all(),
    col("documents").all(), compta.finances(jour.slice(0, 4)), col("avis_recus").all(), col("memoire").all(), col("settings").findOne({ key: "profile" }),
  ]);
  const nomClient = (id) => (clients.find((c) => String(c._id) === String(id)) || {}).nom || "";
  const sections = [];
  const ajouter = (cle, titre, lien, lignes, plus) => { if (lignes.length) sections.push({ cle, titre, lien, lignes, plus: plus || 0 }); };

  // Rendez-vous du jour
  const rdvJour = rdvs.filter((r) => ag.versLocal(r.debut).jour === jour).sort((a, b) => new Date(a.debut) - new Date(b.debut));
  ajouter("rdv", "Rendez-vous", "agenda", rdvJour.map((r) => ({
    texte: ag.versLocal(r.debut).heure + " · " + (r.titre || "Rendez-vous") + (r.avec ? " avec " + r.avec : ""),
    sous: [r.lieu, r.statut === "a_confirmer" ? "à confirmer" : ""].filter(Boolean).join(" · "),
  })));

  // Publications prévues aujourd'hui
  const pubs = planning.filter((p) => p.date === jour && p.statut !== "publie").sort((a, b) => String(a.heure || "99").localeCompare(String(b.heure || "99")));
  ajouter("publications", "Publications du jour", "calendrier", pubs.map((p) => ({
    texte: [p.heure, nomClient(p.clientId), [p.format, p.reseau].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
    sous: [court(p.sujet, 90), ETAPES[p.statut] || ""].filter(Boolean).join(" · "),
  })));

  // Retouches demandées par les clients
  const modifs = planning.filter((p) => p.statut === "creation" && p.validation && p.validation.decision === "modif");
  ajouter("modifs", "Retouches demandées", "calendrier", modifs.slice(0, 6).map((p) => ({
    texte: [nomClient(p.clientId), court(p.sujet || p.format, 70)].filter(Boolean).join(" · "),
    sous: court(p.validation.commentaire, 140),
  })), modifs.length - 6);

  // Relances prévues (et en retard)
  ajouter("relances", "Relances", "accueil", relances.slice(0, 8).map((r) => ({
    texte: r.nom + (r.relanceLe < jour ? " · prévue le " + jourCourt(r.relanceLe) : ""),
    sous: court(r.note || r.besoin, 120),
  })), relances.length - 8);

  // Demandes non lues
  const nonLues = messages.filter((m) => !m.spam && !m.lu).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  ajouter("demandes", "Demandes non lues", "messages", nonLues.slice(0, 5).map((m) => ({
    texte: m.nom || "Sans nom",
    sous: court(m.besoin || m.message, 120),
  })), nonLues.length - 5);

  // Factures : en retard, et échéances du jour
  const echeancesJour = docs.filter((d) => d.type === "facture" && (d.statut === "envoyee" || d.statut === "partielle") && d.echeance === jour && compta.totaux(d).reste > 0);
  const lignesArgent = fin.enRetard.liste.slice(0, 6).map((f) => ({
    texte: (f.numero || "Facture") + " · " + f.client + " · " + fcfa(f.reste),
    sous: "échéance dépassée depuis le " + jourCourt(f.echeance),
  })).concat(echeancesJour.map((d) => ({
    texte: (d.numero || "Facture") + " · " + nomClient(d.clientId) + " · " + fcfa(compta.totaux(d).reste),
    sous: "échéance aujourd’hui",
  })));
  ajouter("factures", "Factures à suivre", "finances", lignesArgent, fin.enRetard.liste.length - 6);

  // Renouvellements dans la semaine
  const renouv = clients.filter((c) => (c.statut || "actif") === "actif" && c.renouvellement && c.renouvellement >= jour && c.renouvellement <= dans7)
    .sort((a, b) => a.renouvellement.localeCompare(b.renouvellement));
  ajouter("renouvellements", "Renouvellements cette semaine", "clients", renouv.map((c) => ({
    texte: c.nom + " · " + (c.renouvellement === jour ? "aujourd’hui" : "le " + jourCourt(c.renouvellement)),
    sous: c.montantMensuel ? fcfa(c.montantMensuel) + " par mois" : "",
  })));

  // À valider dans l'espace pro
  const aValider = [];
  const nbAvis = avisRecus.filter((a) => a.statut === "a_valider").length;
  const nbMemoire = memoire.filter((m) => m.statut === "proposee").length;
  if (nbAvis) aValider.push({ texte: pluriel(nbAvis, "avis client à publier ou écarter", "avis clients à publier ou écarter"), sous: "" });
  if (nbMemoire) aValider.push({ texte: pluriel(nbMemoire, "leçon proposée par l’équipe", "leçons proposées par l’équipe"), sous: "Équipe IA → Mémoire" });
  if (fin.devisEnAttente.nb) aValider.push({ texte: pluriel(fin.devisEnAttente.nb, "devis envoyé sans réponse", "devis envoyés sans réponse"), sous: fcfa(fin.devisEnAttente.montant) + " au total" });
  ajouter("valider", "À regarder", "accueil", aValider);

  // Chapeau et objet de l'email
  const resume = [];
  if (rdvJour.length) resume.push(pluriel(rdvJour.length, "rendez-vous", "rendez-vous"));
  if (pubs.length) resume.push(pluriel(pubs.length, "publication", "publications"));
  if (relances.length) resume.push(pluriel(relances.length, "relance", "relances"));
  if (nonLues.length) resume.push(pluriel(nonLues.length, "demande non lue", "demandes non lues"));
  if (fin.enRetard.nb) resume.push(pluriel(fin.enRetard.nb, "facture en retard", "factures en retard"));
  const vide = !sections.length;
  const dateLongue = ag.libelleJour(jour);
  const prenom = String((profil && profil.nom) || "Paule").trim().split(/\s+/)[0] || "Paule";
  const chapeau = vide ? "Journée calme : rien d’urgent dans votre espace pro."
    : resume.length ? "Aujourd’hui : " + resume.join(", ") + "." : "Quelques points à regarder aujourd’hui.";
  const sujet = (vide ? "Journée calme" : "Votre journée") + " · " + dateLongue.charAt(0).toUpperCase() + dateLongue.slice(1) +
    (resume.length ? " : " + resume.slice(0, 3).join(", ") : "");
  const argent = "Ce mois-ci : " + fcfa(fin.moisCourant.encaisse) + " encaissés" + (fin.aEncaisser.montant ? " · " + fcfa(fin.aEncaisser.montant) + " à encaisser" : "") + ".";

  const b = { jour, dateLongue, prenom, sujet, chapeau, argent, sections, vide };
  b.texte = enTexte(b);
  b.html = enHtml(b);
  return b;
}

function enTexte(b) {
  const out = ["Bonjour " + b.prenom + ",", "", b.chapeau, ""];
  b.sections.forEach((s) => {
    out.push(s.titre.toUpperCase());
    s.lignes.forEach((l) => out.push("• " + l.texte + (l.sous ? "\n  " + l.sous : "")));
    if (s.plus > 0) out.push("  … et " + s.plus + " de plus");
    out.push("");
  });
  out.push(b.argent);
  return out.join("\n");
}

function enHtml(b) {
  const lien = (route) => site() + "/admin#" + route;
  const sections = b.sections.map((s) =>
    '<div style="background:#ffffff;border:1px solid #e3e6ec;border-radius:12px;padding:14px 16px;margin:0 0 12px">' +
    '<div style="font-size:15px;font-weight:700;margin:0 0 8px;color:#1d2433">' + escHtml(s.titre) +
    ' <span style="color:#6b7385;font-weight:400">(' + (s.lignes.length + Math.max(0, s.plus)) + ")</span></div>" +
    s.lignes.map((l) => '<div style="padding:6px 0;border-top:1px solid #f0f2f5;font-size:14px;line-height:1.45;color:#1d2433">' + escHtml(l.texte) +
      (l.sous ? '<div style="font-size:13px;color:#6b7385;margin-top:2px">' + escHtml(l.sous) + "</div>" : "") + "</div>").join("") +
    (s.plus > 0 ? '<div style="font-size:13px;color:#6b7385;padding-top:6px">… et ' + s.plus + " de plus</div>" : "") +
    '<div style="padding-top:8px"><a href="' + escHtml(lien(s.lien)) + '" style="font-size:13px;color:#2D6AE0;text-decoration:none">Ouvrir dans l’espace pro →</a></div></div>').join("");
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escHtml(b.sujet) + "</title></head>" +
    '<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px">' +
    '<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7385;margin:0 0 6px">Brief du matin · ' + escHtml(b.dateLongue) + "</div>" +
    '<div style="font-size:22px;font-weight:700;color:#1d2433;margin:0 0 6px">Bonjour ' + escHtml(b.prenom) + "</div>" +
    '<div style="font-size:15px;line-height:1.5;color:#3d4556;margin:0 0 18px">' + escHtml(b.chapeau) + "</div>" +
    sections +
    '<div style="font-size:13px;color:#3d4556;margin:6px 0 18px">' + escHtml(b.argent) + "</div>" +
    '<a href="' + escHtml(site() + "/admin") + '" style="display:inline-block;background:#2D6AE0;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:10px">Ouvrir mon espace pro</a>' +
    '<div style="font-size:12px;color:#8a91a0;margin-top:22px;line-height:1.5">Vous recevez ce brief chaque matin. Pour l’arrêter : Réglages → Brief du matin.</div>' +
    "</div></body></html>";
}

/** Envoi programmé : une fois par jour au plus, seulement si le brief est activé. */
async function envoyerDuJour() {
  const r = await reglages();
  const jour = ag.aujourdhui();
  if (!r.actif) return { envoye: false, raison: "Brief désactivé" };
  if (r.dernierJour === jour) return { envoye: false, raison: "Déjà envoyé aujourd’hui" };
  // Verrou posé avant l'envoi : deux déclenchements rapprochés n'envoient qu'un brief
  await o.majReglage(CLE, { dernierJour: jour });
  const b = await composer(jour);
  const maintenant = new Date().toISOString();
  if (b.vide && !r.siVide) {
    await o.majReglage(CLE, { dernierLe: maintenant, dernierResultat: "Journée calme : rien d’envoyé" });
    return { envoye: false, raison: "Rien à signaler" };
  }
  // Email (si Resend est configuré) et notification sur les appareils abonnés
  const email = emailConfigure() ? await notifier(b.sujet, b.texte, { html: b.html, delai: 10000 }) : false;
  const appareils = await require("./push").envoyer({ titre: "Votre journée", corps: b.chapeau, lien: "accueil", type: "matin" });
  const resultat = [email ? "Email envoyé" : emailConfigure() ? "L’email a échoué (vérifiez Resend)" : "",
    appareils ? "notification sur " + appareils + " appareil" + (appareils > 1 ? "s" : "") : ""].filter(Boolean).join(" · ") || "Rien d’envoyé : ni email ni notifications configurés";
  await o.majReglage(CLE, { dernierLe: maintenant, dernierResultat: resultat, dernierJour: email || appareils ? jour : r.dernierJour });
  return { envoye: !!(email || appareils), email, appareils };
}

/** Envoi de test depuis les réglages (ne compte pas comme le brief du jour). */
async function envoyerTest() {
  if (!emailConfigure()) throw o.erreur(400, "Ajoutez RESEND_API_KEY et NOTIFY_EMAIL dans Vercel pour recevoir le brief");
  const b = await composer();
  const ok = await notifier("[Test] " + b.sujet, b.texte, { html: b.html, delai: 10000 });
  if (!ok) throw o.erreur(502, "Resend a refusé l’envoi : vérifiez la clé et l’adresse");
  return { ok: true, message: "Brief envoyé à votre adresse" };
}

module.exports = { CLE, reglages, composer, envoyerDuJour, envoyerTest, emailConfigure };
