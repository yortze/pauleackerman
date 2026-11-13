// Agenda de Paule : disponibilités, créneaux libres, rendez-vous.
// Toutes les heures sont celles de Libreville (UTC+1, pas d'heure d'été).
const { col } = require("./store");

const DECALAGE = "+01:00";
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const AGENDA_DEFAUT = {
  key: "agenda",
  actif: true,                // réservation d'appel proposée sur le site
  dureeAppel: 30,             // minutes
  delaiMinHeures: 12,         // pas de réservation à moins de 12 h
  joursAVenir: 14,            // fenêtre de réservation
  lieuAppel: "Appel WhatsApp ou Google Meet (lien envoyé par Paule)",
  plages: [
    { jour: 1, debut: "09:00", fin: "12:00" }, { jour: 1, debut: "14:00", fin: "17:00" },
    { jour: 2, debut: "09:00", fin: "12:00" }, { jour: 2, debut: "14:00", fin: "17:00" },
    { jour: 3, debut: "09:00", fin: "12:00" }, { jour: 3, debut: "14:00", fin: "17:00" },
    { jour: 4, debut: "09:00", fin: "12:00" }, { jour: 4, debut: "14:00", fin: "17:00" },
    { jour: 5, debut: "09:00", fin: "12:00" },
  ],
};

async function reglages() {
  const doc = await col("settings").findOne({ key: "agenda" });
  return Object.assign({}, AGENDA_DEFAUT, doc || {});
}

/** "2026-11-16T09:30" (heure de Libreville) → Date */
function depuisLocal(s) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:00${DECALAGE}`);
  return isNaN(d) ? null : d;
}
/** Date → { jour: "2026-11-16", heure: "09:30" } à Libreville */
function versLocal(d) {
  const x = new Date(new Date(d).getTime() + 3600000).toISOString();
  return { jour: x.slice(0, 10), heure: x.slice(11, 16) };
}
function jourSemaine(jourIso) { return new Date(jourIso + "T12:00:00" + DECALAGE).getUTCDay(); }
function libelleJour(jourIso) {
  return new Date(jourIso + "T12:00:00" + DECALAGE).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Libreville" });
}
function libelleDate(d) {
  return new Date(d).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Libreville" });
}
function ajouterJours(jourIso, n) {
  const d = new Date(jourIso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function aujourdhui() { return versLocal(new Date()).jour; }

async function rdvActifs() {
  return (await col("rendezvous").all()).filter((r) => r.statut !== "annule");
}

function chevauche(debut, finMs, rdvs, ignorerId) {
  return rdvs.some((r) => {
    if (ignorerId && String(r._id) === String(ignorerId)) return false;
    const a = new Date(r.debut).getTime();
    const b = a + (r.dureeMin || 30) * 60000;
    return debut < b && finMs > a;
  });
}

/** Créneaux libres d'une journée selon les plages de disponibilité. */
async function creneauxLibres(jourIso, dureeMin, opts) {
  const cfg = opts && opts.cfg ? opts.cfg : await reglages();
  const rdvs = opts && opts.rdvs ? opts.rdvs : await rdvActifs();
  const duree = Math.max(10, Number(dureeMin) || cfg.dureeAppel || 30);
  const js = jourSemaine(jourIso);
  const limite = Date.now() + (opts && opts.public ? (cfg.delaiMinHeures || 0) * 3600000 : 0);
  const out = [];
  for (const p of (cfg.plages || []).filter((x) => Number(x.jour) === js)) {
    let t = depuisLocal(`${jourIso}T${p.debut}`);
    const fin = depuisLocal(`${jourIso}T${p.fin}`);
    if (!t || !fin) continue;
    for (; t.getTime() + duree * 60000 <= fin.getTime(); t = new Date(t.getTime() + duree * 60000)) {
      const a = t.getTime();
      if (a < limite) continue;
      if (chevauche(a, a + duree * 60000, rdvs)) continue;
      out.push(versLocal(t).heure);
    }
  }
  return out;
}

/** Prochains jours avec des créneaux (pour la réservation sur le site). */
async function prochainsCreneaux(maxJours) {
  const cfg = await reglages();
  if (!cfg.actif) return { actif: false, jours: [] };
  const rdvs = await rdvActifs();
  const jours = [];
  let j = aujourdhui();
  for (let i = 0; i <= (cfg.joursAVenir || 14) && jours.length < (maxJours || 6); i++, j = ajouterJours(j, 1)) {
    const heures = await creneauxLibres(j, cfg.dureeAppel, { cfg, rdvs, public: true });
    if (heures.length) jours.push({ jour: j, libelle: libelleJour(j), heures });
  }
  return { actif: true, dureeMin: cfg.dureeAppel, lieu: cfg.lieuAppel, jours };
}

module.exports = {
  AGENDA_DEFAUT, JOURS, reglages, depuisLocal, versLocal, libelleJour, libelleDate,
  ajouterJours, aujourdhui, rdvActifs, chevauche, creneauxLibres, prochainsCreneaux,
};
