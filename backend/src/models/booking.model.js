import { Schema } from "mongoose";
import { vehicles } from "../../../frontend/js/booking.js";

const coordinates = new Schema({
  lat: { type: Number, required: true, min: -90, max: 90 },
  lon: { type: Number, required: true, min: -180, max: 180 }
}, { _id: false });

const bookingSchema = new Schema({
  _id: { type: String, required: true },
  submittedAt: { type: String, required: true },
  vehicle: {
    type: String,
    required: true,
    trim: true,
    enum: vehicles.map(vehicle => vehicle.id)
  },
  pickup: {
    type: String,
    required: true,
    trim: true,
    minLength: 3,
    maxLength: 200,
    match: /^[^\x00-\x1f\x7f]+$/
  },
  pickupDate: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/
  },
  returnDate: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/
  },
  dropoff: {
    type: String,
    trim: true,
    minLength: 3,
    maxLength: 200,
    match: /^[^\x00-\x1f\x7f]+$/
  },
  pickupCity: { type: String, trim: true, maxLength: 100 },
  // Set only when the booking was submitted with a signed-in customer session.
  accountEmail: String,
  pickupCoordinates: coordinates,
  dropoffCoordinates: coordinates,
  estimatedFareInr: { type: Number, min: 0 },
  fareInputs: Schema.Types.Mixed
}, {
  id: false,
  versionKey: false,
  autoCreate: false,
  autoIndex: false
});
bookingSchema.index({ accountEmail: 1, submittedAt: -1 });

export function createBookingModel(connection) {
  return connection.model("Booking", bookingSchema, "bookings");
}
