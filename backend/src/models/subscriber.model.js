import mongoose from "mongoose";
import { recordFields, schemaOptions } from "./submission.schema.js";

const { Schema } = mongoose;

const subscriberSchema = new Schema({
  ...recordFields,
  email: { type: String, required: true }
}, schemaOptions);
subscriberSchema.index({ email: 1 }, { unique: true });

export function createSubscriberModel(connection) {
  return connection.model("Subscriber", subscriberSchema, "subscribers");
}
