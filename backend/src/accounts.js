// Customer account storage. Mirrors the submission stores: Mongoose models when a
// database is connected, atomic JSON files otherwise, with the same single-process
// write queue. Reads and writes go through here so the controller never touches
// storage directly.
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { selectPublicFields } from "./records.js";

function duplicateEmail() {
  const message = "An account already uses this email address.";
  return Object.assign(new Error(message), { status: 409, errors: { email: message } });
}

function createJsonAccounts(dataDir) {
  const filename = path.join(dataDir, "users.json");
  let queue = Promise.resolve();

  async function readAll() {
    try {
      const records = JSON.parse(await fs.readFile(filename, "utf8"));
      if (!Array.isArray(records)) throw new Error("Account storage must contain an array.");
      return records;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return [];
    }
  }

  return {
    async find(email) {
      return (await readAll()).find((record) => record?.email === email) || null;
    },
    updatePassword(email, passwordHash) {
      const operation = queue.then(async () => {
        const records = await readAll();
        const target = records.find((record) => record?.email === email);
        if (!target) return;
        target.passwordHash = passwordHash;
        const temporary = filename + "." + randomUUID() + ".tmp";
        try {
          await fs.writeFile(temporary, JSON.stringify(records, null, 2) + "\n", {
            encoding: "utf8", mode: 0o600, flag: "wx"
          });
          await fs.rename(temporary, filename);
        } finally {
          await fs.rm(temporary, { force: true });
        }
      });
      queue = operation.catch(() => {});
      return operation;
    },
    create(record) {
      const operation = queue.then(async () => {
        await fs.mkdir(dataDir, { recursive: true });
        const records = await readAll();
        // Check inside the queue so two simultaneous signups cannot share an email.
        if (records.some((saved) => saved?.email === record.email)) throw duplicateEmail();
        records.push(record);
        const temporary = filename + "." + randomUUID() + ".tmp";
        try {
          await fs.writeFile(temporary, JSON.stringify(records, null, 2) + "\n", {
            encoding: "utf8", mode: 0o600, flag: "wx"
          });
          await fs.rename(temporary, filename);
        } finally {
          await fs.rm(temporary, { force: true });
        }
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
}

function createModelAccounts(models) {
  return {
    async find(email) {
      return models.users.findOne({ email }).lean().exec();
    },
    async create(record) {
      try {
        await models.users.create(record);
      } catch (error) {
        if (error.code === 11000) throw duplicateEmail();
        throw error;
      }
    },
    async updatePassword(email, passwordHash) {
      await models.users.updateOne({ email }, { $set: { passwordHash } }).exec();
    }
  };
}

export function createAccountStore({ dataDir, models }) {
  return models?.users ? createModelAccounts(models) : createJsonAccounts(dataDir);
}

// Bookings a signed-in customer made. Booking records only carry accountEmail when
// they were submitted with a valid session, so this never returns another
// customer's booking.
export function createBookingReader({ dataDir, models }) {
  const fields = ["id", "submittedAt", "vehicle", "pickup", "dropoff",
    "pickupDate", "returnDate", "estimatedFareInr"];

  return async function listBookings(accountEmail, limit = 25) {
    if (models?.bookings) {
      const projection = Object.fromEntries(fields.map((field) => [field, 1]));
      const records = await models.bookings.find({ accountEmail }, projection)
        .sort({ submittedAt: -1 }).limit(limit).lean().exec();
      return records.map(record => selectPublicFields(record, fields));
    }
    let records;
    try {
      records = JSON.parse(await fs.readFile(path.join(dataDir, "bookings.json"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    if (!Array.isArray(records)) return [];
    return records
      .filter((record) => record?.accountEmail === accountEmail)
      .reverse()
      .slice(0, limit)
      .map((record) => Object.fromEntries(fields.map((field) => [field, record[field]])));
  };
}

export { duplicateEmail };
