import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { requireJsonObject, sendJson, sameOrigin } from "../http.js";
import { businessToday, businessDate, recentDays } from "../today.js";
import { selectPublicFields } from "../records.js";

const deriveKey = promisify(scrypt);
const sessionDuration = 8 * 60 * 60;
const pageSize = 25;
const summaryLimit = 2000;
const fields = {
  bookings: ["id", "submittedAt", "vehicle", "pickup", "dropoff", "pickupDate", "returnDate", "estimatedFareInr"],
  contacts: ["id", "submittedAt", "name", "email", "message"],
  subscribers: ["id", "submittedAt", "email"]
};

export function createAdminController({ passwordHash, secondPasswordHash, secureCookie = false, models, dataDir }) {
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
    if (models) {
      const projection = Object.fromEntries(columns.map(column => [column, 1]));
      const records = await models[collection].find({}, projection)
        .sort({ submittedAt: -1, _id: -1 }).skip(offset).limit(pageSize + 1).lean().exec();
      return records.map(record => selectPublicFields(record, columns));
    }

    let records;
    try {
      records = JSON.parse(await readFile(path.join(dataDir, collection + ".json"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return records.reverse().slice(offset, offset + pageSize + 1)
      .map(record => selectPublicFields(record, columns));
  }

  async function readCollection(collection) {
    if (models) {
      // Capped so a large collection cannot be pulled into memory wholesale.
      return models[collection].find({}, { _id: 0 }).sort({ submittedAt: -1 })
        .limit(summaryLimit).lean().exec();
    }
    try {
      const records = JSON.parse(await readFile(path.join(dataDir, collection + ".json"), "utf8"));
      return Array.isArray(records) ? records.slice(-summaryLimit).reverse() : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function countCollection(collection) {
    if (models) return models[collection].estimatedDocumentCount().exec();
    return (await readCollection(collection)).length;
  }

  // Everything the admin charts need, in one request.
  async function summarise() {
    const [bookings, contacts, subscribers, accounts] = await Promise.all([
      readCollection("bookings"),
      countCollection("contacts"),
      countCollection("subscribers"),
      models?.users ? models.users.estimatedDocumentCount().exec() : countUsersFromFile()
    ]);

    const today = businessToday();
    const stages = { upcoming: 0, active: 0, completed: 0 };
    const vehicles = new Map();
    const byDay = new Map();
    let revenue = 0;
    let attributed = 0;

    // The last 14 days always appear, so the chart keeps a steady shape.
    for (const date of recentDays(14)) byDay.set(date, 0);

    for (const booking of bookings) {
      const stage = booking.pickupDate > today ? "upcoming"
        : booking.returnDate && booking.returnDate < today ? "completed" : "active";
      stages[stage]++;
      vehicles.set(booking.vehicle, (vehicles.get(booking.vehicle) || 0) + 1);
      if (Number.isFinite(booking.estimatedFareInr)) revenue += booking.estimatedFareInr;
      if (booking.accountEmail) attributed++;
      // Bucket by the business-timezone day, matching how the axis was built.
      const day = businessDate(booking.submittedAt);
      if (day && byDay.has(day)) byDay.set(day, byDay.get(day) + 1);
    }

    return {
      totals: {
        bookings: bookings.length, contacts, subscribers, accounts,
        attributed, anonymous: bookings.length - attributed
      },
      // True once the read hit its cap, so the UI can say the figures cover only
      // the most recent bookings instead of presenting a subtotal as the total.
      capped: bookings.length >= summaryLimit,
      revenue,
      stages,
      byDay: [...byDay].map(([date, count]) => ({ date, count })),
      vehicles: [...vehicles].map(([vehicle, count]) => ({ vehicle, count }))
        .sort((a, b) => b.count - a.count)
    };
  }

  async function countUsersFromFile() {
    try {
      const records = JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8"));
      return Array.isArray(records) ? records.length : 0;
    } catch (error) {
      if (error.code === "ENOENT") return 0;
      throw error;
    }
  }

  return async function handleAdminRequest(request, response, apiPath) {
    const { pathname, searchParams } = response.locals;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
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
      const html = await readFile(path.join(import.meta.dirname, "..", "admin", "index.html"));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end(request.method === "HEAD" ? undefined : html);
    }

    if (request.method === "POST") {
      // Admin posts must carry an Origin, so the stricter check stays here.
      if (!request.headers.origin || !sameOrigin(request)) {
        return sendJson(response, 403, { message: "Submit this request from the TruckBhai admin page." });
      }
      if (apiPath === "/login") {
        const { password } = requireJsonObject(request);
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
      if (apiPath === "/logout") {
        sessions.delete(token);
        setCookie(response, "", 0);
        return sendJson(response, 200, { message: "Signed out." });
      }
    }

    if (!signedIn) return sendJson(response, 401, { message: "Sign in to continue." });

    if (apiPath === "/summary") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        return sendJson(response, 405, { message: "Method not allowed." });
      }
      return sendJson(response, 200, await summarise());
    }

    const collection = apiPath.slice(1);
    if (!Object.hasOwn(fields, collection)) return sendJson(response, 404, { message: "Page not found." });
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return sendJson(response, 405, { message: "Method not allowed." });
    }

    const page = Number(searchParams.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
      return sendJson(response, 400, { message: "Invalid page number." });
    }
    const records = await listRecords(collection, page);
    return sendJson(response, 200, { records: records.slice(0, pageSize), hasNext: records.length > pageSize });
  };
}
