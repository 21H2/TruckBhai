"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { loadMongoConfig, connectMongo } = require("./mongo.js");

async function readRecords(name) {
  const filename = path.join(__dirname, "data", name + ".json");
  let contents;
  try {
    contents = await fs.readFile(filename, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  let records;
  try {
    records = JSON.parse(contents);
  } catch {
    throw new Error(`Invalid JSON in backend/data/${name}.json.`);
  }
  if (!Array.isArray(records) || records.some((record) =>
    typeof record?.id !== "string" || !record.id ||
    typeof record.submittedAt !== "string" ||
    (name === "subscribers" && (typeof record.email !== "string" || !record.email.trim()))
  )) {
    throw new Error(`Invalid records in backend/data/${name}.json.`);
  }
  return records;
}

async function importRecords(collection, records) {
  let inserted = 0;
  for (const record of records) {
    const filter = collection.collectionName === "subscribers"
      ? { email: record.email.trim().toLowerCase() }
      : { _id: record.id };
    const document = { ...record, _id: record.id, ...filter };
    try {
      const result = await collection.updateOne(filter, { $setOnInsert: document }, { upsert: true });
      if (!result.acknowledged) throw new Error("MongoDB did not acknowledge the import.");
      inserted += result.upsertedCount;
    } catch (error) {
      // Another process may have inserted this record or email after our upsert started.
      if (error.code !== 11000 || !(await collection.findOne(filter, { projection: { _id: 1 } }))) {
        throw error;
      }
    }
  }
  return inserted;
}

async function main() {
  const config = loadMongoConfig();
  if (!config.uri) throw new Error("Set MONGODB_URI before importing.");
  const names = ["bookings", "contacts", "subscribers"];
  const records = await Promise.all(names.map(readRecords));
  const client = await connectMongo(config);
  try {
    const db = client.db(config.database);
    for (const [index, name] of names.entries()) {
      const inserted = await importRecords(db.collection(name), records[index]);
      console.log(`${name}: imported ${inserted}, already present ${records[index].length - inserted}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Import failed:", error.name.startsWith("Mongo") ? error.name : error.message);
  process.exitCode = 1;
});
