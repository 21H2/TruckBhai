import { Schema } from "mongoose";
import { validEmail } from "../../../frontend/js/forms.js";

const contactSchema = new Schema({
  _id: { type: String, required: true },
  submittedAt: { type: String, required: true },
  name: {
    type: String,
    required: true,
    trim: true,
    minLength: 2,
    maxLength: 100,
    match: /^[^\x00-\x1f\x7f]+$/
  },
  email: {
    type: String,
    required: true,
    trim: true,
    maxLength: 254,
    validate: { validator: validEmail, message: "Enter a valid email address." }
  },
  message: {
    type: String,
    required: true,
    trim: true,
    minLength: 10,
    maxLength: 5000,
    match: /^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+$/
  }
}, {
  id: false,
  versionKey: false,
  autoCreate: false,
  autoIndex: false
});

export function createContactModel(connection) {
  return connection.model("Contact", contactSchema, "contacts");
}
