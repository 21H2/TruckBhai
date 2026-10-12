"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const bookings = require("./js/booking.js");
const forms = require("./js/forms.js");

const root = __dirname;
const pages = new Set([
  "index.html", "about.html", "vehicle-models.html", "testimonials.html",
  "our-team.html", "contact.html"
]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
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

async function readJson(request) {
  if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
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

  return function saveRecord(values) {
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
      if (uniqueEmail && records.some((record) =>
        typeof record?.email === "string" && record.email.toLowerCase() === values.email.toLowerCase())) {
        const message = "This email address is already subscribed.";
        throw Object.assign(requestError(409, message), { errors: { email: message } });
      }
      const record = {
        id: randomUUID(),
        submittedAt: new Date().toISOString(),
        ...values
      };
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
      return record;
    });
    // A failed write must not prevent later submissions from being retried.
    queue = operation.catch(() => {});
    return operation;
  };
}

function createApp({ dataDir = path.join(root, "data") } = {}) {
  const routes = {
    "/api/bookings": { validate: bookings.validate, save: createJsonStore(dataDir, "bookings") },
    "/api/contacts": { validate: forms.contact, save: createJsonStore(dataDir, "contacts") },
    "/api/subscribers": { validate: forms.subscriber, save: createJsonStore(dataDir, "subscribers", { uniqueEmail: true }) }
  };

  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    try {
      const url = new URL(request.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
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
        const record = await route.save(values);
        return sendJson(response, 201, { message: "Your submission was saved.", id: record.id });
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        return sendJson(response, 405, { message: "Method not allowed." });
      }
      const file = pathname === "/" ? "index.html" : pathname.slice(1);
      // Only public site files are served; submissions and server files stay private.
      const publicAsset = /^(?:css|js|images)\/[a-zA-Z0-9_.-]+$/.test(file);
      const mimeType = mimeTypes[path.extname(file)];
      if ((!pages.has(file) && !publicAsset) || !mimeType) {
        return sendJson(response, 404, { message: "Page not found." });
      }
      const contents = await fs.readFile(path.join(root, file));
      response.writeHead(200, { "Content-Type": mimeType });
      response.end(request.method === "HEAD" ? undefined : contents);
    } catch (error) {
      if (response.destroyed) return;
      const status = error.status || (error.code === "ENOENT" ? 404 : error instanceof URIError ? 400 : 500);
      if (status === 500) console.error("Request failed:", error.message);
      sendJson(response, status, {
        message: status === 500 ? "Could not save your request. Please try again."
          : status === 404 ? "Page not found." : error.message,
        ...(error.errors ? { errors: error.errors } : {})
      });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const app = createApp();
  app.on("error", (error) => {
    console.error("Could not start TruckBhai:", error.message);
    process.exitCode = 1;
  });
  app.listen(port, "127.0.0.1", () => {
    console.log(`TruckBhai is running at http://127.0.0.1:${port}`);
  });
}

module.exports = { createApp };
