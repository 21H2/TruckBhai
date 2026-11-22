import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { connectDatabase } from "./config/database.js";
import { recordReference } from "./records.js";
import { DATA_DIR, ENV_FILE, DEFAULT_MONGODB_DATABASE } from "./config/constants.js";

async function readRecords(name) {
  const filename = path.join(DATA_DIR, name + ".json");
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
    typeof recordReference(record) !== "string" || !recordReference(record) ||
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
    const { id, ...fields } = record;
    const reference = id ?? fields._id;
    const filter = collection.collectionName === "subscribers"
      ? { email: record.email.trim().toLowerCase() }
      : { _id: reference };
    const document = { ...fields, _id: reference, ...filter };
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
  const { error } = dotenv.config({ path: ENV_FILE, quiet: true });
  if (error && error.code !== "ENOENT") throw error;

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("Set MONGODB_URI before importing.");
  const database = process.env.MONGODB_DB?.trim() || DEFAULT_MONGODB_DATABASE;
  const names = ["bookings", "contacts", "subscribers"];
  const records = await Promise.all(names.map(readRecords));
  const connection = await connectDatabase({ uri, database });
  try {
    const db = connection.db;
    for (const [index, name] of names.entries()) {
      const inserted = await importRecords(db.collection(name), records[index]);
      console.log(`${name}: imported ${inserted}, already present ${records[index].length - inserted}`);
    }
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error("Import failed:", error.name.startsWith("Mongo") ? error.name : error.message);
  process.exitCode = 1;
});
