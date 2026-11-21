import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { createJourneyService } from "./journeys.js";
import { createFuelLookup } from "./fuel.js";
import { DATA_DIR, FRONTEND_DIR } from "./config/constants.js";
import { sendJson } from "./http.js";
import { createAdminRoutes } from "./routes/admin.routes.js";
import { createJourneyRoutes } from "./routes/journey.routes.js";
import { createSubmissionRoutes } from "./routes/submission.routes.js";

const publicDependencies = new Map([
  ["vendor/leaflet/leaflet.css", fileURLToPath(import.meta.resolve("leaflet/dist/leaflet.css"))],
  ["vendor/leaflet/leaflet.js", fileURLToPath(import.meta.resolve("leaflet/dist/leaflet.js"))],
  ["vendor/leaflet/leaflet.js.map", fileURLToPath(import.meta.resolve("leaflet/dist/leaflet.js.map"))],
  ["vendor/leaflet/images/layers.png", fileURLToPath(import.meta.resolve("leaflet/dist/images/layers.png"))],
  ["vendor/leaflet/images/layers-2x.png", fileURLToPath(import.meta.resolve("leaflet/dist/images/layers-2x.png"))],
  ["vendor/leaflet/images/marker-icon.png", fileURLToPath(import.meta.resolve("leaflet/dist/images/marker-icon.png"))],
  ["vendor/montserrat/montserrat-latin-400-normal.woff2", fileURLToPath(import.meta.resolve("@fontsource/montserrat/files/montserrat-latin-400-normal.woff2"))]
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

function createApp({ dataDir = DATA_DIR, db, models, journeys = createJourneyService(), fuel = createFuelLookup(db), mailer, admin = {} } = {}) {
  const app = express();
  app.disable("x-powered-by");

  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    const url = new URL(request.url, "http://localhost");
    response.locals.pathname = decodeURIComponent(url.pathname);
    response.locals.searchParams = url.searchParams;
    next();
  });

  app.use(createAdminRoutes({ ...admin, models, dataDir }));
  app.use(createJourneyRoutes({ journeys, fuel }));
  app.use(createSubmissionRoutes({ dataDir, models, journeys, fuel, mailer }));

  app.use(async (request, response) => {
    const { pathname } = response.locals;
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
    const filename = dependency || path.join(FRONTEND_DIR, file);
    if (request.method === "HEAD") {
      const metadata = await fs.stat(filename);
      if (!metadata.isFile()) return sendJson(response, 404, { message: "Page not found." });
      response.writeHead(200, { "Content-Type": mimeType, "Content-Length": metadata.size });
      return response.end();
    }
    const contents = await fs.readFile(filename);
    response.writeHead(200, { "Content-Type": mimeType, "Content-Length": contents.length });
    response.end(contents);
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (response.destroyed) return;
    const status = error.status || (error.code === "ENOENT" ? 404 : error instanceof URIError ? 400 : 500);
    if (status === 500) console.error("Request failed:", db ? error.name : error.message);
    sendJson(response, status, {
      message: status === 500 ? "Could not process your request. Please try again."
        : status === 404 && !error.status ? "Page not found." : error.message,
      ...(error.errors ? { errors: error.errors } : {})
    });
  });

  return app;
}

export { createApp };
