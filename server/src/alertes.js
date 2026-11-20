// Prévenir Paule d'un événement : fil d'activité de l'admin, email (Resend)
// et notification sur son téléphone (si elle les a activées).
const o = require("./outils");
const { notifier } = require("./notify");

/**
 * { type, texte, sous, lien (route de l'admin), icone, email (true = envoyer aussi un email) }
 */
async function alerter(a) {
  await o.evenement(a.type, a.texte, a.sous, a.lien, a.icone);
  const taches = [];
  if (a.email) taches.push(notifier(a.texte, [a.sous, a.details].filter(Boolean).join("\n\n")));
  try {
    const push = require("./push");
    taches.push(push.envoyer({ titre: a.texte, corps: a.sous || "", lien: a.lien || "", type: a.type }));
  } catch (e) {
    /* notifications non disponibles */
  }
  await Promise.all(taches.map((t) => Promise.resolve(t).catch(() => false)));
}

module.exports = { alerter };
