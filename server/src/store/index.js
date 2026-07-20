// Sélection du driver : MongoDB si MONGODB_URI est défini, sinon JSON local.
const { MONGODB_URI } = require("../config");

const driver = MONGODB_URI ? require("./mongoStore") : require("./jsonStore");

async function init() {
  if (driver.connect) await driver.connect();
  console.log(`[store] driver actif : ${driver.kind}`);
}

module.exports = { col: driver.collection, init, kind: driver.kind };
