"use strict";

const http = require("node:http");
const { once } = require("node:events");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const bookings = require("../frontend/js/booking.js");
const forms = require("../frontend/js/forms.js");
const { loadMongoConfig, connectMongo } = require("./mongo.js");
const { createJourneyService } = require("./journeys.js");
const { createAdmin } = require("./admin.js");
const { createMailer } = require("./email.js");

const frontendDir = path.join(__dirname, "..", "frontend");
const publicDependencies = new Map([
  ["vendor/leaflet/leaflet.css", require.resolve("leaflet/dist/leaflet.css")],
  ["vendor/leaflet/leaflet.js", require.resolve("leaflet/dist/leaflet.js")],
  ["vendor/leaflet/leaflet.js.map", require.resolve("leaflet/dist/leaflet.js.map")],
  ["vendor/leaflet/images/layers.png", require.resolve("leaflet/dist/images/layers.png")],
  ["vendor/leaflet/images/layers-2x.png", require.resolve("leaflet/dist/images/layers-2x.png")],
  ["vendor/leaflet/images/marker-icon.png", require.resolve("leaflet/dist/images/marker-icon.png")],
  ["vendor/montserrat/montserrat-latin-400-normal.woff2", require.resolve("@fontsource/montserrat/files/montserrat-latin-400-normal.woff2")]
]);
const pages = new Set([
  "index.html", "about.html", "vehicle-models.html", "testimonials.html",
  "our-team.html", "contact.html"
]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".ico": "image/x-icon"
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function requestError(status, message) {
  return Object.assign(new Error(message), { status });
}

function duplicateSubscription() {
  const message = "This email address is already subscribed.";
  return Object.assign(requestError(409, message), { errors: { email: message } });
}

async function readJson(request) {
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw requestError(415, "Send form data as JSON.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    // Drain oversized bodies without retaining them or destroying the response socket.
    if (size <= 32768) chunks.push(chunk);
  }
  if (size > 32768) throw requestError(413, "The submitted form is too large.");
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw requestError(400, "Send a valid JSON object.");
  }
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

function createMongoStore(db, name, { uniqueEmail = false } = {}) {
  const collection = db.collection(name);
  return async function saveRecord(record) {
    try {
      const result = await collection.insertOne({ ...record, _id: record.id });
      if (!result.acknowledged) throw new Error("MongoDB did not acknowledge the write.");
    } catch (error) {
      if (uniqueEmail && error.code === 11000 && error.keyPattern?.email === 1) {
        throw duplicateSubscription();
      }
      throw error;
    }
  };
}

const { createFuelLookup, seedVehicles } = require("./fuel.js");

function createApp({ dataDir = path.join(__dirname, "data"), db, journeys = createJourneyService(), fuel = createFuelLookup(db), mailer, admin = {} } = {}) {
  const store = db ? createMongoStore.bind(null, db) : createJsonStore.bind(null, dataDir);
  const routes = {
    "/api/bookings": { validate: bookings.validate, save: store("bookings") },
    "/api/contacts": { validate: forms.contact, save: store("contacts"), confirmation: "contact" },
    "/api/subscribers": { validate: forms.subscriber, save: store("subscribers", { uniqueEmail: true }), confirmation: "subscription" }
  };
  const handleAdmin = createAdmin({ ...admin, db, dataDir, readJson, sendJson });
  const journeyRoutes = { "/api/fuel": fuel, "/api/places": journeys.places, "/api/journey": journeys.route };

  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    try {
      const url = new URL(request.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === "/admin" || pathname === "/admin/login" || pathname.startsWith("/api/admin/")) {
        return await handleAdmin(request, response, pathname, url.searchParams);
      }
      if (Object.hasOwn(journeyRoutes, pathname)) {
        if (request.method !== "GET") {
          response.setHeader("Allow", "GET");
          return sendJson(response, 405, { message: "Use GET to look up a location or route." });
        }
        return sendJson(response, 200, await journeyRoutes[pathname](url.searchParams));
      }
      const route = Object.hasOwn(routes, pathname) ? routes[pathname] : null;
      if (route) {
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          return sendJson(response, 405, { message: "Use POST to submit this form." });
        }
        if (request.headers.origin && request.headers.origin !== "http://" + request.headers.host) {
          return sendJson(response, 403, { message: "Submit this form from this website." });
        }
        const input = await readJson(request);
        const { values, errors } = route.validate(input);
        if (Object.keys(errors).length) {
          return sendJson(response, 422, { message: "Check the form details.", errors });
        }
        if (pathname === "/api/bookings" && values.dropoff) {
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
        const record = { id: randomUUID(), submittedAt: new Date().toISOString(), ...values };
        await route.save(record);
        if (mailer && route.confirmation) {
          // A mail failure must not turn an already-saved submission into a failed form response.
          Promise.resolve().then(() => mailer.send(route.confirmation, record)).catch((error) => {
            console.error("Could not send %s confirmation for %s: %s", route.confirmation, record.id, error.message);
          });
        }
        return sendJson(response, 201, { message: "Your submission was saved.", id: record.id });
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        return sendJson(response, 405, { message: "Method not allowed." });
      }
      const file = pathname === "/" ? "index.html" : pathname.slice(1);
      // Only public site files are served; submissions and server files stay private.
      const publicAsset = /^(?:css|js|images)\/[a-zA-Z0-9_.-]+$/.test(file);
      const dependency = publicDependencies.get(file);
      const mimeType = mimeTypes[path.extname(file)];
      if ((!pages.has(file) && !publicAsset && !dependency) || !mimeType) {
        return sendJson(response, 404, { message: "Page not found." });
      }
      response.setHeader("Cache-Control", pages.has(file) ? "no-cache" : "public, max-age=300");
      const filename = dependency || path.join(frontendDir, file);
      if (request.method === "HEAD") {
        const metadata = await fs.stat(filename);
        if (!metadata.isFile()) return sendJson(response, 404, { message: "Page not found." });
        response.writeHead(200, { "Content-Type": mimeType, "Content-Length": metadata.size });
        return response.end();
      }
      const contents = await fs.readFile(filename);
      response.writeHead(200, { "Content-Type": mimeType, "Content-Length": contents.length });
      response.end(contents);
    } catch (error) {
      if (response.destroyed) return;
      const status = error.status || (error.code === "ENOENT" ? 404 : error instanceof URIError ? 400 : 500);
      if (status === 500) console.error("Request failed:", db ? error.name : error.message);
      sendJson(response, status, {
        message: status === 500 ? "Could not process your request. Please try again."
          : status === 404 && !error.status ? "Page not found." : error.message,
        ...(error.errors ? { errors: error.errors } : {})
      });
    }
  });
}

async function start() {
  const config = loadMongoConfig();
  const port = Number(process.env.PORT || 3000);
  const client = config.uri ? await connectMongo(config) : null;
  try {
    const db = client?.db(config.database);
    if (db) await seedVehicles(db);
    const app = createApp({
      db,
      mailer: createMailer(),
      admin: {
        passwordHash: process.env.ADMIN_PASSWORD_HASH,
        secondPasswordHash: process.env.ADMIN_SECOND_PASSWORD_HASH,
        secureCookie: process.env.ADMIN_SECURE_COOKIE === "true"
      }
    });
    app.listen(port, "127.0.0.1");
    await once(app, "listening");
    console.log(`TruckBhai is running at http://127.0.0.1:${app.address().port} (${client ? "MongoDB" : "JSON"} storage)`);
    const stop = () => app.close();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    await once(app, "close");
  } finally {
    await client?.close();
  }
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Could not start TruckBhai:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
