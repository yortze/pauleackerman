// Socle commun aux assistants IA, quel que soit le fournisseur :
// quota quotidien, journal des exécutions et état affiché dans l'admin.
//
//   Diagnostic clients  → OpenAI   (raisonnement sur les demandes reçues)
//   Prospection & audits → Claude  (recherche web de nouveaux clients)
//   Agenda & relances   → OpenAI   (rendez-vous, relances, suivi)
const { col } = require("../store");

const LIMITE_JOUR = Number(process.env.AI_DAILY_LIMIT || 40);

const AGENTS = {
  diagnostic: { nom: "Diagnostic clients", fournisseur: "OpenAI" },
  prospection: { nom: "Prospection & audits", fournisseur: "Claude" },
  agenda: { nom: "Agenda & relances", fournisseur: "OpenAI" },
};

function erreur(code, message) {
  const e = new Error(message);
  e.status = code;
  return e;
}

/** Journée comptée à l'heure de Libreville (UTC+1, sans heure d'été). */
function jour(d) {
  return new Date((d ? new Date(d) : new Date()).getTime() + 3600000).toISOString().slice(0, 10);
}

async function verifierQuota(agent) {
  const auj = jour();
  const n = (await col("ia_runs").all()).filter((r) => r.agent === agent && r.jour === auj).length;
  if (n >= LIMITE_JOUR) {
    throw erreur(429, `Quota du jour atteint pour « ${AGENTS[agent].nom} » (${LIMITE_JOUR} exécutions). Il se réinitialise demain, ou augmentez AI_DAILY_LIMIT.`);
  }
}

/** Consommation cumulée d'une exécution (qui peut faire plusieurs appels). */
function compteur() {
  return { appels: 0, entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0, recherches: 0 };
}

async function journaliser(agent, tache, c, ok, detail, extra) {
  try {
    await col("ia_runs").insert({
      agent, tache, jour: jour(), ok: !!ok,
      fournisseur: AGENTS[agent].fournisseur,
      modele: (extra && extra.modele) || "",
      appels: c.appels, entree: c.entree, sortie: c.sortie, recherches: c.recherches,
      coutUsd: extra && typeof extra.coutUsd === "number" ? extra.coutUsd : null,
      detail: String(detail || "").slice(0, 300),
    });
  } catch (e) {
    console.warn("[ia] journal impossible :", e.message);
  }
}

/** État des assistants pour l'admin. `infos[agent]` = { configure, modele, cleDediee }. */
async function etat(infos) {
  const runs = await col("ia_runs").all();
  const auj = jour();
  const mois = auj.slice(0, 7);
  const agents = {};
  for (const a of Object.keys(AGENTS)) {
    const r = runs.filter((x) => x.agent === a);
    const duMois = r.filter((x) => String(x.jour).startsWith(mois));
    const couts = duMois.filter((x) => typeof x.coutUsd === "number");
    agents[a] = Object.assign({}, AGENTS[a], infos[a] || {}, {
      aujourdhui: r.filter((x) => x.jour === auj).length,
      mois: duMois.length,
      jetonsMois: duMois.reduce((s, x) => s + (x.entree || 0) + (x.sortie || 0), 0),
      coutMoisUsd: couts.length ? Math.round(couts.reduce((s, x) => s + x.coutUsd, 0) * 100) / 100 : null,
    });
  }
  return {
    limiteJour: LIMITE_JOUR,
    agents,
    derniers: runs.slice(-15).reverse().map((r) => ({
      agent: r.agent, fournisseur: r.fournisseur, tache: r.tache, ok: r.ok, coutUsd: r.coutUsd, quand: r.createdAt, detail: r.detail,
    })),
  };
}

module.exports = { AGENTS, LIMITE_JOUR, erreur, jour, verifierQuota, compteur, journaliser, etat };
