// Driver MongoDB (activé quand MONGODB_URI est défini).
const mongoose = require("mongoose");
const { MONGODB_URI } = require("../config");

const models = {};

async function connect() {
  await mongoose.connect(MONGODB_URI);
  console.log("[store] MongoDB connecté");
}

function modelFor(name) {
  if (!models[name]) {
    const schema = new mongoose.Schema({}, { strict: false, timestamps: true });
    models[name] = mongoose.model(name, schema, name);
  }
  return models[name];
}

const clean = (d) => d && { ...d.toObject({ versionKey: false }), _id: String(d._id) };

function collection(name) {
  const M = modelFor(name);
  return {
    async all(filter) {
      return (await M.find(filter || {}).sort({ createdAt: 1 })).map(clean);
    },
    async get(id) {
      try {
        return clean(await M.findById(id));
      } catch {
        return null;
      }
    },
    async findOne(filter) {
      return clean(await M.findOne(filter));
    },
    async insert(doc) {
      return clean(await M.create(doc));
    },
    async update(id, patch) {
      try {
        return clean(await M.findByIdAndUpdate(id, patch, { new: true }));
      } catch {
        return null;
      }
    },
    async remove(id) {
      try {
        return !!(await M.findByIdAndDelete(id));
      } catch {
        return false;
      }
    },
    async count(filter) {
      return M.countDocuments(filter || {});
    },
    async replaceAll(docs) {
      await M.deleteMany({});
      if (docs.length) await M.insertMany(docs);
    },
  };
}

module.exports = { collection, connect, kind: "mongo" };
