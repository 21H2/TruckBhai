"use strict";

const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const deriveKey = promisify(scrypt);
const sessionDuration = 8 * 60 * 60;
const pageSize = 25;
const fields = {
  bookings: ["id", "submittedAt", "vehicle", "pickup", "dropoff", "pickupDate", "returnDate", "estimatedFareInr"],
  contacts: ["id", "submittedAt", "name", "email", "message"],
  subscribers: ["id", "submittedAt", "email"]
};

function createAdmin({ passwordHash, secondPasswordHash, secureCookie = false, db, dataDir, readJson, sendJson }) {
  const credentials = [passwordHash, secondPasswordHash]
    .map(hash => /^([0-9a-f]{32}):([0-9a-f]{128})$/i.exec(hash || ""))
    .filter(Boolean)
    .map(([, salt, key]) => ({ salt: Buffer.from(salt, "hex"), key: Buffer.from(key, "hex") }));
  const sessions = new Map();
  const cookieName = secureCookie ? "__Host-truckbhai_admin" : "truckbhai_admin";
  const cookieFlags = "Path=/; HttpOnly; SameSite=Strict" + (secureCookie ? "; Secure" : "");
  let attempts = 0;
  let resetAt = 0;

  function setCookie(response, token, maxAge) {
    response.setHeader("Set-Cookie", `${cookieName}=${token}; Max-Age=${maxAge}; ${cookieFlags}`);
  }

  function redirect(response, location) {
    response.writeHead(303, { Location: location });
    response.end();
  }

  async function listRecords(collection, page) {
    const offset = (page - 1) * pageSize;
    const columns = fields[collection];
    if (db) {
      const projection = Object.fromEntries(columns.map(column => [column, 1]));
      return db.collection(collection).find({}, { projection: { ...projection, _id: 0 } })
        .sort({ submittedAt: -1, _id: -1 }).skip(offset).limit(pageSize + 1).toArray();
    }

    let records;
    try {
      records = JSON.parse(await readFile(path.join(dataDir, collection + ".json"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return records.reverse().slice(offset, offset + pageSize + 1)
      .map(record => Object.fromEntries(columns.map(column => [column, record[column]])));
  }

  return async function handleAdmin(request, response, pathname, query) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    if (credentials.length === 0) return sendJson(response, 503, { message: "Admin access is not configured." });

    const token = request.headers.cookie?.match(new RegExp(`(?:^|; *)${cookieName}=([0-9a-f]{64})(?:;|$)`))?.[1];
    const expiresAt = sessions.get(token);
    const signedIn = expiresAt > Date.now();
    if (expiresAt && !signedIn) sessions.delete(token);

    if (pathname === "/admin" || pathname === "/admin/login") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        return sendJson(response, 405, { message: "Method not allowed." });
      }
      if (pathname === "/admin" && !signedIn) return redirect(response, "/admin/login");
      if (pathname === "/admin/login" && signedIn) return redirect(response, "/admin");
      const html = await readFile(path.join(__dirname, "admin", "index.html"));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end(request.method === "HEAD" ? undefined : html);
    }

    if (request.method === "POST") {
      const protocol = secureCookie ? "https" : "http";
      if (request.headers["sec-fetch-site"] === "cross-site" ||
          request.headers.origin !== `${protocol}://${request.headers.host}`) {
        return sendJson(response, 403, { message: "Submit this request from the TruckBhai admin page." });
      }
      if (pathname === "/api/admin/login") {
        const { password } = await readJson(request);
        if (typeof password !== "string" || password.length === 0 || password.length > 256) {
          return sendJson(response, 400, { message: "Enter the admin password." });
        }

        const now = Date.now();
        if (now >= resetAt) {
          attempts = 0;
          resetAt = now + 60_000;
        }
        if (attempts >= 5) {
          response.setHeader("Retry-After", Math.ceil((resetAt - now) / 1000));
          return sendJson(response, 429, { message: "Too many login attempts. Try again in a minute." });
        }
        attempts++;
        const matches = await Promise.all(credentials.map(async ({ salt, key }) => {
          const candidate = await deriveKey(password, salt, key.length);
          return timingSafeEqual(candidate, key);
        }));
        if (!matches.includes(true)) {
          return sendJson(response, 401, { message: "Incorrect password." });
        }

        attempts = 0;
        sessions.delete(token);
        for (const [id, expiry] of sessions) {
          if (expiry <= now) sessions.delete(id);
        }
        if (sessions.size >= 20) sessions.delete(sessions.keys().next().value);
        const newToken = randomBytes(32).toString("hex");
        sessions.set(newToken, Date.now() + sessionDuration * 1000);
        setCookie(response, newToken, sessionDuration);
        return sendJson(response, 200, { message: "Signed in." });
      }
      if (pathname === "/api/admin/logout") {
        sessions.delete(token);
        setCookie(response, "", 0);
        return sendJson(response, 200, { message: "Signed out." });
      }
    }

    if (!signedIn) return sendJson(response, 401, { message: "Sign in to continue." });
    const collection = pathname.slice("/api/admin/".length);
    if (!Object.hasOwn(fields, collection)) return sendJson(response, 404, { message: "Page not found." });
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return sendJson(response, 405, { message: "Method not allowed." });
    }

    const page = Number(query.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
      return sendJson(response, 400, { message: "Invalid page number." });
    }
    const records = await listRecords(collection, page);
    return sendJson(response, 200, { records: records.slice(0, pageSize), hasNext: records.length > pageSize });
  };
}

module.exports = { createAdmin };
