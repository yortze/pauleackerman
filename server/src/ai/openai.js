// OpenAI — utilisé par le diagnostic des demandes clients et par l'assistant
// agenda & relances (raisonnement, rendez-vous, suivi). Les deux partagent la
// même clé : OPENAI_API_KEY (ou OPENAI_API_KEY_DIAGNOSTIC / _AGENDA pour une
// clé dédiée). Modèle : OPENAI_MODEL, par défaut gpt-5.5.
//
// API Responses en mode « sans stockage » (store: false) : les demandes des
// clients ne sont pas conservées côté OpenAI entre deux appels.
const { OpenAI } = require("openai");
const { erreur } = require("./commun");

const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const EFFORT = process.env.OPENAI_REASONING_EFFORT || "medium"; // « off » pour un modèle sans raisonnement
const AVEC_RAISONNEMENT = EFFORT !== "off" && /^(gpt-5|gpt-6|o\d)/.test(MODEL);

// Coût estimé seulement si les tarifs sont fournis ($ par million de jetons)
const PRIX_ENTREE = Number(process.env.OPENAI_PRICE_INPUT || 0);
const PRIX_SORTIE = Number(process.env.OPENAI_PRICE_OUTPUT || 0);

const clients = {};
function cle(agent) { return process.env["OPENAI_API_KEY_" + agent.toUpperCase()] || process.env.OPENAI_API_KEY || ""; }
function estConfigure(agent) { return !!cle(agent); }
function info(agent) { return { configure: estConfigure(agent), modele: MODEL, cleDediee: !!process.env["OPENAI_API_KEY_" + agent.toUpperCase()] }; }

function getClient(agent) {
  const k = cle(agent);
  if (!k) throw erreur(503, "Assistant non configuré : ajoutez la variable OPENAI_API_KEY (clé OpenAI) dans Vercel puis redéployez.");
  if (!clients[k]) clients[k] = new OpenAI({ apiKey: k, maxRetries: 2, timeout: 280000 });
  return clients[k];
}

function cumuler(c, u) {
  if (!u) return;
  c.appels++;
  c.entree += u.input_tokens || 0;
  c.sortie += u.output_tokens || 0;
  c.cacheLu += (u.input_tokens_details && u.input_tokens_details.cached_tokens) || 0;
}
function cout(c) {
  if (!PRIX_ENTREE || !PRIX_SORTIE) return null;
  return Math.round(((c.entree * PRIX_ENTREE + c.sortie * PRIX_SORTIE) / 1e6) * 10000) / 10000;
}

function traduire(e) {
  if (e instanceof OpenAI.AuthenticationError) return erreur(502, "La clé OpenAI est refusée : vérifiez OPENAI_API_KEY.");
  if (e instanceof OpenAI.PermissionDeniedError) return erreur(502, "La clé OpenAI n’a pas accès au modèle " + MODEL + ".");
  if (e instanceof OpenAI.NotFoundError) return erreur(502, "Modèle OpenAI introuvable (" + MODEL + ") : vérifiez OPENAI_MODEL.");
  if (e instanceof OpenAI.RateLimitError) return erreur(429, "OpenAI reçoit trop de demandes pour ce compte, ou le crédit est épuisé. Réessayez plus tard.");
  if (e instanceof OpenAI.BadRequestError) return erreur(502, "Requête refusée par OpenAI : " + e.message);
  if (e instanceof OpenAI.APIConnectionError) return erreur(502, "Impossible de joindre OpenAI. Réessayez.");
  if (e instanceof OpenAI.APIError) return erreur(502, "OpenAI a renvoyé une erreur (" + e.status + "). Réessayez.");
  return e;
}

async function creer(agent, c, params) {
  let rep;
  try {
    rep = await getClient(agent).responses.create(Object.assign(
      { model: MODEL, store: false, max_output_tokens: 16000 },
      AVEC_RAISONNEMENT ? { reasoning: { effort: EFFORT }, include: ["reasoning.encrypted_content"] } : {},
      params
    ));
  } catch (e) {
    throw traduire(e);
  }
  cumuler(c, rep.usage);
  if (rep.status === "incomplete") {
    const raison = rep.incomplete_details && rep.incomplete_details.reason;
    if (raison === "content_filter") throw erreur(422, "OpenAI a bloqué cette réponse (filtre de contenu). Traitez cette demande à la main.");
    throw erreur(502, "La réponse d’OpenAI a été coupée. Réessayez avec une demande plus courte.");
  }
  const refus = (rep.output || []).some((o) => o.type === "message" && (o.content || []).some((x) => x.type === "refusal"));
  if (refus) throw erreur(422, "OpenAI a refusé de traiter cette demande. Traitez-la à la main.");
  return rep;
}

/** Réponse JSON conforme au schéma (sortie structurée stricte). */
async function json(agent, c, { instructions, input, schema, nom }) {
  const rep = await creer(agent, c, {
    instructions,
    input,
    text: { format: { type: "json_schema", name: nom, schema, strict: true } },
  });
  try {
    return JSON.parse(rep.output_text);
  } catch (e) {
    throw erreur(502, "La réponse d’OpenAI n’est pas un JSON valide. Réessayez.");
  }
}

/**
 * Boucle d'appels d'outils : OpenAI demande des fonctions, on les exécute
 * (`executer(nom, args)`), on renvoie les résultats, jusqu'à la réponse finale.
 */
async function boucle(agent, c, { instructions, input, tools, executer, maxTours }) {
  let entree = input.slice();
  const actions = [];
  for (let tour = 0; tour < (maxTours || 10); tour++) {
    const rep = await creer(agent, c, { instructions, input: entree, tools });
    const appels = (rep.output || []).filter((o) => o.type === "function_call");
    if (!appels.length) return { texte: (rep.output_text || "").trim(), actions };

    // On renvoie la sortie telle quelle (raisonnement chiffré compris), puis les résultats
    entree = entree.concat(rep.output);
    for (const a of appels) {
      let args = null;
      try { args = JSON.parse(a.arguments || "{}"); } catch (e) { args = null; }
      let sortie;
      if (!args) {
        sortie = { erreur: "Arguments illisibles, recommence l’appel." };
        actions.push({ outil: a.name, ok: false, erreur: "arguments illisibles" });
      } else {
        try {
          sortie = await executer(a.name, args);
          actions.push({ outil: a.name, entree: args, ok: true });
        } catch (e) {
          sortie = { erreur: e.message };
          actions.push({ outil: a.name, entree: args, ok: false, erreur: e.message });
        }
      }
      entree.push({ type: "function_call_output", call_id: a.call_id, output: JSON.stringify(sortie) });
    }
  }
  throw erreur(504, "L’assistant a dépassé le nombre d’étapes autorisé. Réessayez avec une demande plus ciblée.");
}

module.exports = { MODEL, estConfigure, info, json, boucle, cout };
