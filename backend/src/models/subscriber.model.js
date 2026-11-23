import { Schema } from "mongoose";
import { validEmail } from "../../../frontend/js/forms.js";

const subscriberSchema = new Schema({
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
  }
}, {
  id: false,
  versionKey: false,
  autoCreate: false,
  autoIndex: false
});

export function createSubscriberModel(connection) {
  return connection.model("Subscriber", subscriberSchema, "subscribers");
}
