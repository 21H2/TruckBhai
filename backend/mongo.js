"use strict";

const path = require("node:path");

function loadMongoConfig() {
  try {
    process.loadEnvFile(path.join(__dirname, ".env"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    uri: process.env.MONGODB_URI?.trim(),
    database: process.env.MONGODB_DB?.trim() || "truckbhai"
  };
}

async function connectMongo({ uri, database }) {
  const { MongoClient } = require("mongodb");
  let client;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    await client.db(database).collection("subscribers").createIndex({ email: 1 }, { unique: true });
    return client;
  } catch (error) {
    await client?.close().catch(() => {});
    const code = typeof error.code === "number" ? `, code ${error.code}` : "";
    throw new Error(`Could not initialize MongoDB (${error.name}${code}). Check the connection and subscriber index.`);
  }
}

module.exports = { loadMongoConfig, connectMongo };
