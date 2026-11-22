import mongoose from "mongoose";
import { recordFields, schemaOptions } from "./submission.schema.js";

const { Schema } = mongoose;

// passwordHash holds a scrypt "salt:key" pair; no plaintext password is ever stored.
const userSchema = new Schema({
  ...recordFields,
  email: { type: String, required: true },
  name: { type: String, required: true },
  phone: String,
  passwordHash: { type: String, required: true }
}, schemaOptions);
userSchema.index({ email: 1 }, { unique: true });

export function createUserModel(connection) {
  return connection.model("User", userSchema, "users");
}
