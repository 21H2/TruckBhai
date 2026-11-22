import mongoose from "mongoose";
import { recordFields, schemaOptions } from "./submission.schema.js";

const { Schema } = mongoose;

const contactSchema = new Schema({
  ...recordFields,
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true }
}, schemaOptions);

export function createContactModel(connection) {
  return connection.model("Contact", contactSchema, "contacts");
}
