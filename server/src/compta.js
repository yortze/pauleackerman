// Devis, factures, paiements et coûts : calculs partagés par l'admin,
// les assistantes (Awa) et le brief du matin. Montants en FCFA, entiers.
const { col } = require("./store");
const o = require("./outils");

const ST_DEVIS = ["brouillon", "envoye", "accepte", "refuse"];
const ST_FACTURE = ["brouillon", "envoyee", "partielle", "payee", "annulee"];
const MODES_PAIEMENT = ["Mobile Money", "Virement", "Espèces", "Chèque", "Carte", "Autre"];
const STATUTS_CLIENT = ["actif", "pause", "termine"];

const FACTURATION_DEFAUT = {
  raisonSociale: "Paule Ackerman — Social media manager",
  adresse: "Libreville, Gabon",
  telephone: "",
  email: "",
  nif: "",
  rccm: "",
  paiement: "Mobile Money ou virement. Acompte de 50 % à la commande, solde à la livraison.",
  mentions: "",
  tva: 0,
  acompte: 50,
  validiteDevis: 30,
  delaiPaiement: 15,
  tauxHoraire: 0,
};

/** Totaux d'un devis ou d'une facture. */
function totaux(d) {
  const lignes = Array.isArray(d.lignes) ? d.lignes : [];
  const sousTotal = lignes.reduce((s, l) => s + Math.round((Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0)), 0);
  const remise = Math.min(sousTotal, Math.max(0, Number(d.remise) || 0));
  const base = sousTotal - remise;
  const tva = Math.round((base * (Number(d.tva) || 0)) / 100);
  const total = base + tva;
  const paye = (d.paiements || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
  const acompte = Math.round((total * (Number(d.acompte) || 0)) / 100);
  return { sousTotal, remise, base, tva, total, paye, reste: Math.max(0, total - paye), acompte };
}
function enRetard(d, auj) {
  return d.type === "facture" && (d.statut === "envoyee" || d.statut === "partielle") && !!d.echeance && d.echeance < (auj || o.aujourdhui()) && totaux(d).reste > 0;
}
function avecTotaux(d, auj) {
  return Object.assign({}, d, { totaux: totaux(d), enRetard: enRetard(d, auj) });
}
/** Statut d'une facture émise d'après ses paiements. */
function statutFacture(d) {
  if (d.statut === "brouillon" || d.statut === "annulee") return d.statut;
  const t = totaux(d);
  if (t.total > 0 && t.reste <= 0) return "payee";
  return t.paye > 0 ? "partielle" : "envoyee";
}
/** Numéro suivant de l'année : D-2026-001, F-2026-014… */
async function prochainNumero(type, annee) {
  const p = (type === "devis" ? "D" : "F") + "-" + annee + "-";
  const n = (await col("documents").all())
    .filter((d) => d.type === type && String(d.numero || "").indexOf(p) === 0)
    .reduce((m, d) => Math.max(m, Number(String(d.numero).slice(p.length)) || 0), 0);
  return p + String(n + 1).padStart(3, "0");
}

function coutDe(c, taux) {
  return c.type === "temps" ? Math.round((Number(c.heures) || 0) * (Number(taux) || 0)) : Number(c.montant) || 0;
}

/** Tableau de bord de l'argent pour une année. */
async function finances(annee) {
  const auj = o.aujourdhui();
  annee = /^\d{4}$/.test(String(annee || "")) ? String(annee) : auj.slice(0, 4);
  const [docs, couts, clients, reglages] = await Promise.all([
    col("documents").all(), col("couts").all(), col("clients").all(), o.reglage("facturation", FACTURATION_DEFAUT),
  ]);
  const taux = Number(reglages.tauxHoraire) || 0;
  const factures = docs.filter((d) => d.type === "facture" && d.statut !== "brouillon" && d.statut !== "annulee");
  const mois = Array.from({ length: 12 }, (_, i) => annee + "-" + String(i + 1).padStart(2, "0"));
  const parMois = mois.map((m) => ({ mois: m, encaisse: 0, couts: 0, marge: 0 }));
  const parClient = {};
  const ligneClient = (id) => (parClient[id] = parClient[id] || { encaisse: 0, couts: 0, heures: 0, aEncaisser: 0, factures: 0 });

  factures.forEach((f) => {
    const lc = ligneClient(f.clientId || "?");
    lc.factures++;
    if (f.statut === "envoyee" || f.statut === "partielle") lc.aEncaisser += totaux(f).reste;
    (f.paiements || []).forEach((p) => {
      const i = mois.indexOf(String(p.date || "").slice(0, 7));
      if (i === -1) return;
      parMois[i].encaisse += Number(p.montant) || 0;
      lc.encaisse += Number(p.montant) || 0;
    });
  });
  couts.forEach((c) => {
    const i = mois.indexOf(String(c.date || "").slice(0, 7));
    if (i === -1) return;
    const v = coutDe(c, taux);
    parMois[i].couts += v;
    if (c.clientId) {
      const lc = ligneClient(c.clientId);
      lc.couts += v;
      if (c.type === "temps") lc.heures += Number(c.heures) || 0;
    }
  });
  parMois.forEach((m) => { m.marge = m.encaisse - m.couts; });

  const ouvertes = factures.filter((f) => f.statut === "envoyee" || f.statut === "partielle");
  const retard = ouvertes.filter((f) => enRetard(f, auj));
  const devisAttente = docs.filter((d) => d.type === "devis" && d.statut === "envoye");
  const actifs = clients.filter((c) => (c.statut || "actif") === "actif");
  const nomClient = (id) => (clients.find((c) => String(c._id) === String(id)) || {}).nom || "Client supprimé";
  const moisCourant = parMois[mois.indexOf(auj.slice(0, 7))] || { encaisse: 0, couts: 0, marge: 0 };
  const somme = (l, k) => l.reduce((s, x) => s + x[k], 0);

  return {
    annee,
    tauxHoraire: taux,
    moisCourant: { mois: auj.slice(0, 7), encaisse: moisCourant.encaisse, couts: moisCourant.couts, marge: moisCourant.marge },
    annuel: { encaisse: somme(parMois, "encaisse"), couts: somme(parMois, "couts"), marge: somme(parMois, "marge") },
    aEncaisser: { nb: ouvertes.length, montant: ouvertes.reduce((s, f) => s + totaux(f).reste, 0) },
    enRetard: {
      nb: retard.length,
      montant: retard.reduce((s, f) => s + totaux(f).reste, 0),
      liste: retard.map((f) => ({ id: String(f._id), numero: f.numero, client: nomClient(f.clientId), clientId: f.clientId, echeance: f.echeance, reste: totaux(f).reste })),
    },
    devisEnAttente: { nb: devisAttente.length, montant: devisAttente.reduce((s, d) => s + totaux(d).total, 0) },
    recurrent: { clients: actifs.length, montant: actifs.reduce((s, c) => s + (Number(c.montantMensuel) || 0), 0) },
    parMois,
    parClient: Object.keys(parClient).filter((id) => id !== "?").map((id) => Object.assign({ id, nom: nomClient(id), marge: parClient[id].encaisse - parClient[id].couts }, parClient[id]))
      .sort((a, b) => b.encaisse - a.encaisse),
  };
}

module.exports = {
  ST_DEVIS, ST_FACTURE, MODES_PAIEMENT, STATUTS_CLIENT, FACTURATION_DEFAUT,
  totaux, enRetard, avecTotaux, statutFacture, prochainNumero, coutDe, finances,
};
