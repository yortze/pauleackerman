// Socle commun aux assistantes IA, quel que soit le fournisseur :
// budget quotidien en tokens, journal des exécutions et état affiché dans l'admin.
//
//   Nadia — diagnostic des demandes  → OpenAI (modèle léger)
//   Yann  — prospection & audits     → Claude (recherche web)
//   Awa   — agenda & relances        → OpenAI (modèle léger)
const { col } = require("../store");

// Budget par jour et par assistante, en tokens (entrée + sortie, réflexion et cache compris)
const LIMITE_JETONS = Math.max(1000, Number(process.env.AI_DAILY_TOKENS || 1000000));

const AGENTS = {
  diagnostic: { nom: "Diagnostic clients", prenom: "Nadia", fournisseur: "OpenAI" },
  prospection: { nom: "Prospection & audits", prenom: "Yann", fournisseur: "Claude" },
  agenda: { nom: "Agenda & conseil", prenom: "Awa", fournisseur: "OpenAI" },
};

function erreur(code, message) {
  const e = new Error(message);
  e.status = code;
  return e;
}
const fmt = (n) => Number(n || 0).toLocaleString("fr-FR");

/** Journée comptée à l'heure de Libreville (UTC+1, sans heure d'été). */
function jour(d) {
  return new Date((d ? new Date(d) : new Date()).getTime() + 3600000).toISOString().slice(0, 10);
}
/** Tokens consommés par une exécution (anciennes exécutions : entrée + sortie). */
function jetonsDe(r) { return typeof r.jetons === "number" ? r.jetons : (r.entree || 0) + (r.sortie || 0); }

/** Vérifie le budget du jour et renvoie le nombre de tokens encore disponibles. */
async function verifierQuota(agent) {
  const auj = jour();
  const utilises = (await col("ia_runs").all())
    .filter((r) => r.agent === agent && r.jour === auj)
    .reduce((s, r) => s + jetonsDe(r), 0);
  if (utilises >= LIMITE_JETONS) {
    throw erreur(429, `${AGENTS[agent].prenom} a utilisé son budget du jour (${fmt(LIMITE_JETONS)} tokens). Elle reprend demain, ou augmentez AI_DAILY_TOKENS.`);
  }
  return LIMITE_JETONS - utilises;
}

/** Consommation d'une exécution (qui peut faire plusieurs appels), plafonnée au budget restant. */
function compteur(restant) {
  return { appels: 0, entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0, recherches: 0, jetons: 0, plafond: restant || Infinity };
}
/** Arrête une tâche avant un nouvel appel si le budget du jour est épuisé. */
function verifierPlafond(c) {
  if (c && c.jetons >= c.plafond) {
    throw erreur(429, `Budget du jour atteint pendant la tâche (${fmt(LIMITE_JETONS)} tokens). Elle reprendra demain, ou augmentez AI_DAILY_TOKENS.`);
  }
}

async function journaliser(agent, tache, c, ok, detail, extra) {
  try {
    await col("ia_runs").insert({
      agent, tache, jour: jour(), ok: !!ok,
      fournisseur: AGENTS[agent].fournisseur,
      modele: (extra && extra.modele) || "",
      appels: c.appels, entree: c.entree, sortie: c.sortie, recherches: c.recherches, jetons: c.jetons,
      coutUsd: extra && typeof extra.coutUsd === "number" ? extra.coutUsd : null,
      detail: String(detail || "").slice(0, 300),
    });
  } catch (e) {
    console.warn("[ia] journal impossible :", e.message);
  }
}

/** État des assistantes pour l'admin. `infos[agent]` = { configure, modele, cleDediee }. */
async function etat(infos) {
  const runs = await col("ia_runs").all();
  const auj = jour();
  const mois = auj.slice(0, 7);
  const agents = {};
  for (const a of Object.keys(AGENTS)) {
    const r = runs.filter((x) => x.agent === a);
    const duJour = r.filter((x) => x.jour === auj);
    const duMois = r.filter((x) => String(x.jour).startsWith(mois));
    const couts = duMois.filter((x) => typeof x.coutUsd === "number");
    agents[a] = Object.assign({}, AGENTS[a], infos[a] || {}, {
      aujourdhui: duJour.length,
      mois: duMois.length,
      jetonsJour: duJour.reduce((s, x) => s + jetonsDe(x), 0),
      jetonsMois: duMois.reduce((s, x) => s + jetonsDe(x), 0),
      limiteJetons: LIMITE_JETONS,
      coutMoisUsd: couts.length ? Math.round(couts.reduce((s, x) => s + x.coutUsd, 0) * 100) / 100 : null,
    });
  }
  return {
    limiteJetons: LIMITE_JETONS,
    agents,
    derniers: runs.slice(-15).reverse().map((r) => ({
      agent: r.agent, fournisseur: r.fournisseur, tache: r.tache, ok: r.ok, coutUsd: r.coutUsd, jetons: jetonsDe(r), quand: r.createdAt, detail: r.detail,
    })),
  };
}

module.exports = { AGENTS, LIMITE_JETONS, erreur, jour, verifierQuota, verifierPlafond, compteur, journaliser, etat };
