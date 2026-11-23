import { once } from "node:events";
import path from "node:path";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { createMailer } from "./email.js";
import { seedVehicles } from "./models/vehicle.model.js";
import { ENV_FILE, SERVER_HOST, DEFAULT_PORT, DEFAULT_MONGODB_DATABASE } from "./config/constants.js";

async function start() {
  const { error } = dotenv.config({ path: ENV_FILE, quiet: true });
  if (error && error.code !== "ENOENT") throw error;

  const uri = process.env.MONGODB_URI?.trim();
  const database = process.env.MONGODB_DB?.trim() || DEFAULT_MONGODB_DATABASE;
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const connection = uri ? await connectDatabase({ uri, database }) : null;
  try {
    const db = connection?.db;
    if (db) await seedVehicles(db);
    const app = createApp({
      db,
      models: connection?.models,
      mailer: createMailer(),
      admin: {
        passwordHash: process.env.ADMIN_PASSWORD_HASH,
        secondPasswordHash: process.env.ADMIN_SECOND_PASSWORD_HASH,
        secureCookie: process.env.ADMIN_SECURE_COOKIE === "true"
      }
    });
    const server = app.listen(port, SERVER_HOST);
    await once(server, "listening");
    console.log(`TruckBhai is running at http://${SERVER_HOST}:${server.address().port} (${connection ? "MongoDB" : "JSON"} storage)`);
    const stop = () => server.close();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    await once(server, "close");
  } finally {
    await connection?.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  start().catch((error) => {
    console.error("Could not start TruckBhai:", error.message);
    process.exitCode = 1;
  });
}

export { createApp };
