// Point d'entrée Vercel — enveloppe l'app Express en fonction serverless.
// L'initialisation (connexion Mongo, seed, admin) n'est faite qu'une fois
// par instance, puis réutilisée entre les invocations.
const { createApp } = require("../server/src/index");

let appPromise;

module.exports = (req, res) => {
  appPromise = appPromise || createApp();
  return appPromise.then((app) => app(req, res));
};
