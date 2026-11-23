import { Schema } from "mongoose";
import { validEmail } from "../../../frontend/js/forms.js";
import { bcryptHashPattern } from "../passwords.js";

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
    match: bcryptHashPattern
  }
}, {
  id: false,
  versionKey: false,
  autoCreate: false,
  autoIndex: false
});
// this is my notes
// createUserModel is a function that creates the Mongoose User model on a MongoDB connection
export function createUserModel(connection) {
  return connection.model("User", userSchema, "users");
}
