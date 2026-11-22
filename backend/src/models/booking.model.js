import mongoose from "mongoose";
import { recordFields, schemaOptions } from "./submission.schema.js";

const { Schema } = mongoose;

const coordinates = new Schema({
  lat: { type: Number, required: true },
  lon: { type: Number, required: true }
}, { _id: false });

const bookingSchema = new Schema({
  ...recordFields,
  vehicle: { type: String, required: true },
  pickup: { type: String, required: true },
  pickupDate: { type: String, required: true },
  returnDate: { type: String, required: true },
  dropoff: String,
  pickupCity: String,
  // Set only when the booking was submitted with a signed-in customer session.
  accountEmail: String,
  pickupCoordinates: coordinates,
  dropoffCoordinates: coordinates,
  estimatedFareInr: Number,
  fareInputs: Schema.Types.Mixed
}, schemaOptions);
bookingSchema.index({ accountEmail: 1, submittedAt: -1 });

export function createBookingModel(connection) {
  return connection.model("Booking", bookingSchema, "bookings");
}
