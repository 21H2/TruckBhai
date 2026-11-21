import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as bookings from "../../../frontend/js/booking.js";
import * as forms from "../../../frontend/js/forms.js";
import { readJson, requestError, sendJson } from "../http.js";

function duplicateSubscription() {
  const message = "This email address is already subscribed.";
  return Object.assign(requestError(409, message), { errors: { email: message } });
}

function createJsonStore(dataDir, collection, { uniqueEmail = false } = {}) {
  const filename = path.join(dataDir, collection + ".json");
  let queue = Promise.resolve();

  return function saveRecord(record) {
    const operation = queue.then(async () => {
      await fs.mkdir(dataDir, { recursive: true });
      let records;
      try {
        records = JSON.parse(await fs.readFile(filename, "utf8"));
        if (!Array.isArray(records)) throw new Error("Form storage must contain an array.");
      } catch (error) {
        // Never replace an existing file if it cannot be read or parsed.
        if (error.code !== "ENOENT") throw error;
        records = [];
      }
      // Check inside the write queue so concurrent subscriptions cannot duplicate an email.
      if (uniqueEmail && records.some((saved) =>
        typeof saved?.email === "string" && saved.email.toLowerCase() === record.email)) {
        throw duplicateSubscription();
      }
      records.push(record);
      const temporary = filename + "." + randomUUID() + ".tmp";
      try {
        await fs.writeFile(temporary, JSON.stringify(records, null, 2) + "\n", {
          encoding: "utf8", mode: 0o600, flag: "wx"
        });
        await fs.rename(temporary, filename);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    });
    // A failed write must not prevent later submissions from being retried.
    queue = operation.catch(() => {});
    return operation;
  };
}

function createModelStore(models, name, { uniqueEmail = false } = {}) {
  const model = models[name];
  return async function saveRecord(record) {
    try {
      await model.create({ ...record, _id: record.id });
    } catch (error) {
      if (uniqueEmail && error.code === 11000 && error.keyPattern?.email === 1) {
        throw duplicateSubscription();
      }
      throw error;
    }
  };
}

export function createSubmissionController({ dataDir, models, journeys, fuel, mailer }) {
  const store = models ? createModelStore.bind(null, models) : createJsonStore.bind(null, dataDir);

  async function addBookingFare(values) {
    if (!values.dropoff) return;
    const rate = await fuel(new URLSearchParams({
      city: values.pickupCity || values.pickup, vehicle: values.vehicle, pricing: "1"
    }));
    let distanceKm = null;
    if (rate.fuelType !== "electric" && values.pickupCoordinates && values.dropoffCoordinates) {
      const points = new URLSearchParams();
      for (const key of ["pickup", "dropoff"]) {
        const { lat, lon } = values[key + "Coordinates"];
        points.set(key, lat + "," + lon);
      }
      distanceKm = (await journeys.route(points)).distanceKm;
    }
    values.estimatedFareInr = bookings.estimateFare(rate, distanceKm, values.pickupDate, values.returnDate);
    values.fareInputs = { ...rate, distanceKm };
  }

  function submit({ validate, save, confirmation, prepare }) {
    return async (request, response) => {
      if (request.headers.origin && request.headers.origin !== "http://" + request.headers.host) {
        return sendJson(response, 403, { message: "Submit this form from this website." });
      }
      const input = await readJson(request);
      const { values, errors } = validate(input);
      if (Object.keys(errors).length) {
        return sendJson(response, 422, { message: "Check the form details.", errors });
      }
      if (prepare) await prepare(values);
      const record = { id: randomUUID(), submittedAt: new Date().toISOString(), ...values };
      await save(record);
      if (mailer && confirmation) {
        // A mail failure must not turn an already-saved submission into a failed form response.
        Promise.resolve().then(() => mailer.send(confirmation, record)).catch((error) => {
          console.error("Could not send %s confirmation for %s: %s", confirmation, record.id, error.message);
        });
      }
      return sendJson(response, 201, { message: "Your submission was saved.", id: record.id });
    };
  }

  return {
    createBooking: submit({ validate: bookings.validate, save: store("bookings"), prepare: addBookingFare }),
    createContact: submit({ validate: forms.contact, save: store("contacts"), confirmation: "contact" }),
    createSubscriber: submit({
      validate: forms.subscriber,
      save: store("subscribers", { uniqueEmail: true }),
      confirmation: "subscription"
    })
  };
}
