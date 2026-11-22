import { Schema } from "mongoose";
import { validEmail } from "../../../frontend/js/forms.js";

const userSchema = new Schema({
  _id: { type: String, required: true },
  submittedAt: { type: String, required: true },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    maxLength: 254,
    validate: { validator: validEmail, message: "Enter a valid email address." }
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minLength: 2,
    maxLength: 100,
    match: /^[^\x00-\x1f\x7f]+$/
  },
  phone: {
    type: String,
    trim: true,
    match: /^\+?[0-9][0-9 ()-]{6,19}$/
  },
  passwordHash: {
    type: String,
    required: true,
    match: /^[0-9a-f]{32}:[0-9a-f]{128}$/i
  }
}, {
  id: false,
  versionKey: false,
  autoCreate: false,
  autoIndex: false
});

export function createUserModel(connection) {
  return connection.model("User", userSchema, "users");
}
