// Driver de stockage fichier (fallback sans MongoDB).
// Même interface que mongoStore : all / get / insert / update / remove / removeMany / removeWhere / findOne / replaceAll
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DATA_DIR } = require("../config");

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch { /* système de fichiers en lecture seule (Vercel) : lecture seule OK */ }

function fileFor(name) {
  return path.join(DATA_DIR, name + ".json");
}
function load(name) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(name), "utf-8"));
  } catch {
    return [];
  }
}
function save(name, docs) {
  fs.writeFileSync(fileFor(name), JSON.stringify(docs, null, 2), "utf-8");
}

function collection(name) {
  return {
    async all(filter) {
      const docs = load(name);
      if (!filter) return docs;
      return docs.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
    },
    async get(id) {
      return load(name).find((d) => d._id === id) || null;
    },
    async findOne(filter) {
      return (await this.all(filter))[0] || null;
    },
    async insert(doc) {
      const docs = load(name);
      const withId = { _id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...doc };
      docs.push(withId);
      save(name, docs);
      return withId;
    },
    async update(id, patch) {
      const docs = load(name);
      const i = docs.findIndex((d) => d._id === id);
      if (i === -1) return null;
      docs[i] = { ...docs[i], ...patch, _id: id, updatedAt: new Date().toISOString() };
      save(name, docs);
      return docs[i];
    },
    async remove(id) {
      const docs = load(name);
      const next = docs.filter((d) => d._id !== id);
      save(name, next);
      return next.length !== docs.length;
    },
    async removeMany(ids) {
      const cibles = new Set((ids || []).map(String));
      const docs = load(name);
      const next = docs.filter((d) => !cibles.has(d._id));
      if (next.length !== docs.length) save(name, next);
      return docs.length - next.length;
    },
    async removeWhere(filter, opts) {
      const avant = opts && opts.before;
      if (!Object.keys(filter || {}).length && !avant) return 0;
      const docs = load(name);
      const next = docs.filter((d) => !(Object.entries(filter || {}).every(([k, v]) => d[k] === v) && (!avant || String(d.createdAt || "") < avant)));
      if (next.length !== docs.length) save(name, next);
      return docs.length - next.length;
    },
    async count(filter) {
      return (await this.all(filter)).length;
    },
    async replaceAll(docs) {
      save(name, docs);
    },
  };
}

module.exports = { collection, kind: "json" };
