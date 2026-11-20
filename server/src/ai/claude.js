// Claude (Anthropic) — utilisé uniquement par l'assistant de recherche :
// prospection de nouveaux clients et audit de la présence en ligne d'un prospect.
//
// Clé : ANTHROPIC_API_KEY (ou ANTHROPIC_API_KEY_PROSPECTION pour une clé dédiée).
// Modèle : CLAUDE_MODEL, par défaut claude-haiku-5-5 (le moins cher ; il fait la recherche web,
// lit les captures et les PDF). claude-sonnet-5-5 fait des recherches plus fouillées, 20 fois plus cher.
const { Anthropic } = require("@anthropic-ai/sdk");
const { erreur, verifierPlafond } = require("./commun");

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

// Tarifs publics en $ par million de jetons (entrée, sortie), pour l'estimation affichée.
// Haiku 5.5 a deux grilles : la seconde s'applique aux appels dont le prompt dépasse 100 000 jetons.
const TARIFS = {
  "claude-opus-5-5": { entree: 4, sortie: 20 },
  "claude-sonnet-5-5": { entree: 2, sortie: 10 },
  "claude-haiku-5-5": { entree: 0.1, sortie: 0.5, seuil: 100000, entreeLong: 0.5, sortieLong: 2.5 },
};
const PRIX_RECHERCHE = 10 / 1000; // 10 $ les 1 000 recherches web

// Repli serveur (« fallbacks ») : un autre modèle reprend la requête si le premier refuse.
// Haiku 5.5 n'en a pas : on n'envoie ni le paramètre ni l'en-tête bêta.
const REPLI = /^claude-haiku/.test(MODEL) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

let client = null;
function cle() { return process.env.ANTHROPIC_API_KEY_PROSPECTION || process.env.ANTHROPIC_API_KEY || ""; }
function estConfigure() { return !!cle(); }
function info() { return { configure: estConfigure(), modele: MODEL, cleDediee: !!process.env.ANTHROPIC_API_KEY_PROSPECTION }; }

function getClient() {
  if (!cle()) throw erreur(503, "Assistant de recherche non configuré : ajoutez la variable ANTHROPIC_API_KEY (clé Claude) dans Vercel puis redéployez.");
  if (!client) client = new Anthropic({ apiKey: cle(), maxRetries: 2, timeout: 280000 });
  return client;
}

function cumuler(c, usage) {
  if (!usage) return;
  const entree = usage.input_tokens || 0, sortie = usage.output_tokens || 0;
  const lu = usage.cache_read_input_tokens || 0, ecrit = usage.cache_creation_input_tokens || 0;
  c.appels++;
  c.entree += entree;
  c.sortie += sortie;
  c.cacheLu += lu;
  c.cacheEcrit += ecrit;
  c.recherches += (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  c.jetons += entree + sortie + lu + ecrit;
  // Coût de cet appel, avec la grille qui correspond à la taille de son prompt
  const t = TARIFS[MODEL];
  if (t) {
    const long = t.seuil && entree + lu + ecrit > t.seuil;
    const pe = long ? t.entreeLong : t.entree, ps = long ? t.sortieLong : t.sortie;
    c.coutJetons = (c.coutJetons || 0) + ((entree + ecrit * 1.25 + lu * 0.1) * pe + sortie * ps) / 1e6;
  }
}
function cout(c) {
  if (!TARIFS[MODEL]) return null;
  return Math.round(((c.coutJetons || 0) + c.recherches * PRIX_RECHERCHE) * 10000) / 10000;
}

// Message de l'API sans le code HTTP ni le JSON brut autour
function detail(e) { return (e.error && e.error.error && e.error.error.message) || e.message; }

function traduire(e) {
  if (e instanceof Anthropic.AuthenticationError) return erreur(502, "La clé Claude est refusée : vérifiez ANTHROPIC_API_KEY.");
  if (e instanceof Anthropic.PermissionDeniedError) return erreur(502, "La clé Claude n’a pas accès à ce modèle.");
  if (e instanceof Anthropic.RateLimitError) return erreur(429, "Claude reçoit trop de demandes pour ce compte. Réessayez dans une minute.");
  if (e instanceof Anthropic.BadRequestError) return erreur(502, "Requête refusée par l’API Claude : " + detail(e));
  if (e instanceof Anthropic.APIConnectionError) return erreur(502, "Impossible de joindre l’API Claude. Réessayez.");
  if (e instanceof Anthropic.APIError) return erreur(502, "L’API Claude a renvoyé une erreur (" + e.status + "). Réessayez.");
  return e;
}

// Les schémas d'outils sont écrits au format strict d'OpenAI, partagé avec Nadia et Awa.
// Claude refuse un enum combiné à un type multiple ({ type: ["string", "null"], enum: [...] }) :
// on l'écrit pour lui en anyOf ({ anyOf: [{ type: "string", enum: [...] }, { type: "null" }] }).
const DU_TYPE = {
  string: (v) => typeof v === "string",
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
};
function schemaClaude(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return s;
  let o = Object.assign({}, s);
  if (o.properties) o.properties = Object.fromEntries(Object.entries(o.properties).map(([k, v]) => [k, schemaClaude(v)]));
  if (o.items) o.items = schemaClaude(o.items);
  for (const k of ["anyOf", "allOf"]) if (Array.isArray(o[k])) o[k] = o[k].map(schemaClaude);
  if (Array.isArray(o.type) && Array.isArray(o.enum)) {
    const { type, enum: valeurs, ...reste } = o;
    const anyOf = type.filter((t) => t !== "null")
      .map((t) => ({ type: t, enum: valeurs.filter((v) => DU_TYPE[t] && DU_TYPE[t](v)) }))
      .filter((b) => b.enum.length);
    if (type.includes("null")) anyOf.push({ type: "null" });
    o = Object.assign(reste, { anyOf });
  }
  return o;
}
function outilsClaude(tools) {
  return tools.map((t) => (t && t.input_schema ? Object.assign({}, t, { input_schema: schemaClaude(t.input_schema) }) : t));
}

/**
 * Un appel à Claude. Sauf sur Haiku, le repli serveur (« fallbacks ») relance la même
 * requête sur un autre modèle si le premier refuse pour raison de sécurité.
 */
async function appeler(c, params) {
  verifierPlafond(c);
  if (Array.isArray(params.tools)) params = Object.assign({}, params, { tools: outilsClaude(params.tools) });
  let rep;
  try {
    rep = await getClient().beta.messages.create(Object.assign({
      model: MODEL,
      // Cache automatique : les tours suivants (recherches, outils, captures renvoyées)
      // relisent le début de la conversation à 10 % du prix au lieu de le repayer.
      cache_control: { type: "ephemeral" },
    }, REPLI, params));
  } catch (e) {
    throw traduire(e);
  }
  cumuler(c, rep.usage);
  if (rep.stop_reason === "refusal") throw erreur(422, "Claude a refusé de traiter cette demande. Reformulez-la.");
  return rep;
}

function texteDe(rep) {
  return (rep.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

/**
 * Boucle d'agent : Claude fait ses recherches web (outils serveur) puis
 * appelle l'outil final, dont l'entrée est renvoyée.
 */
async function boucle(c, { system, messages, tools, outilFinal, effort, maxTours }) {
  const histo = messages.slice();
  let relance = false;
  for (let tour = 0; tour < (maxTours || 10); tour++) {
    const rep = await appeler(c, {
      max_tokens: 16000,
      system,
      tools,
      output_config: { effort: effort || "medium" },
      messages: histo,
    });
    histo.push({ role: "assistant", content: rep.content });

    if (rep.stop_reason === "pause_turn") continue; // recherche longue : le serveur reprend au tour suivant

    const final = (rep.content || []).find((b) => b.type === "tool_use" && b.name === outilFinal);
    if (final) return { entree: final.input, texte: texteDe(rep) };

    if (rep.stop_reason === "max_tokens") throw erreur(502, "La réponse de Claude a été coupée. Réessayez avec une demande plus ciblée.");
    if (relance) throw erreur(502, "L’assistant n’a pas rendu de résultat exploitable. Réessayez.");
    relance = true;
    histo.push({ role: "user", content: `Termine maintenant en appelant l’outil ${outilFinal} avec tes résultats.` });
  }
  throw erreur(504, "L’assistant a dépassé le nombre d’étapes autorisé. Réessayez avec une demande plus ciblée.");
}

/**
 * Discussion libre avec outils : Claude fait ses recherches web (outils
 * serveur) et appelle les outils de l'application (`executer`), jusqu'à sa
 * réponse finale en texte.
 */
async function discuter(c, { system, messages, tools, executer, effort, maxTours }) {
  const histo = messages.slice();
  const actions = [];
  for (let tour = 0; tour < (maxTours || 12); tour++) {
    const rep = await appeler(c, {
      max_tokens: 16000,
      system,
      tools,
      output_config: { effort: effort || "medium" },
      messages: histo,
    });
    histo.push({ role: "assistant", content: rep.content });
    if (rep.stop_reason === "pause_turn") continue;

    const appels = (rep.content || []).filter((b) => b.type === "tool_use");
    if (appels.length) {
      const resultats = [];
      for (const a of appels) {
        try {
          const r = await executer(a.name, a.input || {});
          actions.push({ outil: a.name, entree: a.input, ok: true, resultat: r });
          resultats.push({ type: "tool_result", tool_use_id: a.id, content: JSON.stringify(r) });
        } catch (e) {
          actions.push({ outil: a.name, entree: a.input, ok: false, erreur: e.message });
          resultats.push({ type: "tool_result", tool_use_id: a.id, content: e.message, is_error: true });
        }
      }
      histo.push({ role: "user", content: resultats });
      continue;
    }
    if (rep.stop_reason === "max_tokens") throw erreur(502, "La réponse de Claude a été coupée. Posez une question plus ciblée.");
    return { texte: texteDe(rep), actions };
  }
  throw erreur(504, "L’assistant a dépassé le nombre d’étapes autorisé. Posez une question plus ciblée.");
}

module.exports = { MODEL, estConfigure, info, appeler, boucle, discuter, cout, texteDe };
