import mongoose from "mongoose";
import { createBookingModel } from "../models/booking.model.js";
import { createContactModel } from "../models/contact.model.js";
import { createSubscriberModel } from "../models/subscriber.model.js";

export async function connectDatabase({ uri, database }) {
  let connection;
  try {
    connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 });
    await connection.asPromise();

    // Keep the URI's authentication database while selecting the app database.
    const appConnection = connection.name === database ? connection : connection.useDb(database);
    const models = {
      bookings: createBookingModel(appConnection),
      contacts: createContactModel(appConnection),
      subscribers: createSubscriberModel(appConnection)
    };
    await models.subscribers.createIndexes();
    return { db: appConnection.db, models, close: () => connection.destroy() };
  } catch (error) {
    await connection?.destroy().catch(() => {});
    const code = typeof error.code === "number" ? `, code ${error.code}` : "";
    throw new Error(`Could not initialize MongoDB (${error.name}${code}). Check the connection and subscriber index.`);
  }
}
