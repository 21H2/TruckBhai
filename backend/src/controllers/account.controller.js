// Customer accounts: register, sign in, sign out, read the signed-in profile and
// list that customer's own bookings.
//
// Security follows the admin controller, which is the proven pattern in this
// codebase: scrypt key derivation with a per-account salt, timingSafeEqual
// comparison, opaque 64-hex session tokens held server side, and an HttpOnly
// SameSite=Strict cookie. Sessions live in memory, so they end when the process
// restarts; that is the same trade-off the admin dashboard already makes.
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import * as forms from "../../../frontend/js/forms.js";
import { requireJsonObject, requestError, sendJson, expectedOrigin, sameOrigin } from "../http.js";
import { createAccountStore, createBookingReader } from "../accounts.js";
import { businessToday } from "../today.js";
import { recordReference } from "../records.js";

const deriveKey = promisify(scrypt);
const keyLength = 64;
const sessionDuration = 7 * 24 * 60 * 60;
const maxSessions = 500;

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, keyLength);
  return salt.toString("hex") + ":" + key.toString("hex");
}

async function passwordMatches(password, stored) {
  const parsed = /^([0-9a-f]{32}):([0-9a-f]{128})$/i.exec(stored || "");
  if (!parsed) return false;
  const [, salt, key] = parsed;
  const expected = Buffer.from(key, "hex");
  const candidate = await deriveKey(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(candidate, expected);
}

export function createAccountController({ dataDir, models, mailer, secureCookie = false }) {
  const accounts = createAccountStore({ dataDir, models });
  const listBookings = createBookingReader({ dataDir, models });
  const sessions = new Map();
  const cookieName = secureCookie ? "__Host-truckbhai_account" : "truckbhai_account";
  const cookieFlags = "Path=/; HttpOnly; SameSite=Strict" + (secureCookie ? "; Secure" : "");
  // Separate maps so flooding one endpoint cannot evict the other's counters.
  const signInAttempts = new Map();
  const resetAttempts = new Map();
  const registerAttempts = new Map();
  // Reset tokens are single use and short lived. They are kept server side and
  // only their raw value, delivered by email, can redeem one.
  const resetTokens = new Map();
  const resetDuration = 30 * 60 * 1000;

  function pruneResets(now) {
    for (const [token, entry] of resetTokens) {
      if (entry.expiresAt <= now) resetTokens.delete(token);
    }
    while (resetTokens.size >= 200) resetTokens.delete(resetTokens.keys().next().value);
  }

  function setCookie(response, token, maxAge) {
    response.setHeader("Set-Cookie", `${cookieName}=${token}; Max-Age=${maxAge}; ${cookieFlags}`);
  }

  function readToken(request) {
    return request.headers.cookie
      ?.match(new RegExp(`(?:^|; *)${cookieName}=([0-9a-f]{64})(?:;|$)`))?.[1];
  }

  function pruneSessions(now) {
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
  }

  // Returns null when the table is full. Evicting the oldest live session instead
  // would let unauthenticated signups sign every real customer out, so a full
  // table refuses the new session rather than destroying existing ones.
  function startSession(response, email) {
    const now = Date.now();
    pruneSessions(now);
    if (sessions.size >= maxSessions) return null;
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { email, expiresAt: now + sessionDuration * 1000 });
    setCookie(response, token, sessionDuration);
    return token;
  }

  function dropSessionsFor(email) {
    for (const [token, session] of sessions) {
      if (session.email === email) sessions.delete(token);
    }
  }

  // Exposed so the booking controller can attribute a submission to its customer.
  function sessionEmail(request) {
    const token = readToken(request);
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session.email;
  }

  // M-1: expired entries are dropped first and a full table refuses rather than
  // evicting a live counter, so an attacker cannot flush a victim's budget.
  function rateLimit(store, key, limit = 5) {
    const now = Date.now();
    for (const [existing, entry] of store) {
      if (now >= entry.resetAt) store.delete(existing);
    }
    const entry = store.get(key);
    if (!entry) {
      if (store.size >= 5000) return 60;
      store.set(key, { count: 1, resetAt: now + 60_000 });
      return null;
    }
    entry.count++;
    if (entry.count > limit) return Math.ceil((entry.resetAt - now) / 1000);
    return null;
  }

  function clientKey(request) {
    return request.ip || request.socket?.remoteAddress || "unknown";
  }

  function profile(record) {
    return { name: record.name, email: record.email, phone: record.phone || "" };
  }

  async function register(request, response) {
    if (!sameOrigin(request)) {
      return sendJson(response, 403, { message: "Submit this form from this website." });
    }
    const retryAfter = rateLimit(registerAttempts, clientKey(request), 10);
    if (retryAfter) {
      response.setHeader("Retry-After", retryAfter);
      return sendJson(response, 429, { message: "Too many sign-up attempts. Try again in a minute." });
    }
    const { values, errors } = forms.registration(requireJsonObject(request));
    if (Object.keys(errors).length) {
      return sendJson(response, 422, { message: "Check the form details.", errors });
    }
    if (await accounts.find(values.email)) {
      const message = "An account already uses this email address.";
      return sendJson(response, 409, { message, errors: { email: message } });
    }

    const record = {
      _id: randomUUID(),
      submittedAt: new Date().toISOString(),
      email: values.email,
      name: values.name,
      phone: values.phone,
      passwordHash: await hashPassword(values.password)
    };
    await accounts.create(record);
    // Replace any session the visitor already carried, so registering cannot be
    // used to graft a new account onto an attacker-planted session.
    const previous = readToken(request);
    if (previous) sessions.delete(previous);
    if (!startSession(response, record.email)) {
      return sendJson(response, 503, {
        message: "Your account was created, but sign-in is busy. Try signing in now."
      });
    }

    if (mailer) {
      // A mail failure must not turn a created account into a failed response.
      Promise.resolve().then(() => mailer.send("welcome", record)).catch((error) => {
        console.error("Could not send welcome email for %s: %s", recordReference(record), error.message);
      });
    }
    return sendJson(response, 201, { message: "Your account is ready.", account: profile(record) });
  }

  async function signIn(request, response) {
    if (!sameOrigin(request)) {
      return sendJson(response, 403, { message: "Submit this form from this website." });
    }
    const { values, errors } = forms.credentials(requireJsonObject(request));
    if (Object.keys(errors).length) {
      return sendJson(response, 422, { message: "Check the form details.", errors });
    }

    const retryAfter = rateLimit(signInAttempts, values.email);
    if (retryAfter) {
      response.setHeader("Retry-After", retryAfter);
      return sendJson(response, 429, { message: "Too many sign-in attempts. Try again in a minute." });
    }

    const record = await accounts.find(values.email);
    const matches = record ? await passwordMatches(values.password, record.passwordHash) : false;
    if (!record || !matches) {
      // One message for both cases, so this cannot be used to discover which
      // email addresses have accounts.
      return sendJson(response, 401, { message: "Email or password is incorrect." });
    }

    signInAttempts.delete(values.email);
    const previous = readToken(request);
    if (previous) sessions.delete(previous);
    if (!startSession(response, record.email)) {
      return sendJson(response, 503, { message: "Sign-in is busy right now. Try again shortly." });
    }
    return sendJson(response, 200, { message: "Signed in.", account: profile(record) });
  }

  function signOut(request, response) {
    if (!sameOrigin(request)) {
      return sendJson(response, 403, { message: "Submit this request from this website." });
    }
    const token = readToken(request);
    if (token) sessions.delete(token);
    setCookie(response, "", 0);
    return sendJson(response, 200, { message: "Signed out." });
  }

  async function currentAccount(request, response) {
    const email = sessionEmail(request);
    if (!email) return sendJson(response, 401, { message: "Sign in to continue." });
    const record = await accounts.find(email);
    if (!record) return sendJson(response, 401, { message: "Sign in to continue." });
    return sendJson(response, 200, { account: profile(record) });
  }

  async function myBookings(request, response) {
    const email = sessionEmail(request);
    if (!email) return sendJson(response, 401, { message: "Sign in to continue." });
    const bookings = await listBookings(email);
    const today = businessToday();
    return sendJson(response, 200, {
      bookings: bookings.map((booking) => ({
        ...booking,
        stage: booking.pickupDate > today ? "upcoming"
          : booking.returnDate && booking.returnDate < today ? "completed" : "active"
      }))
    });
  }

  async function requestReset(request, response) {
    if (!sameOrigin(request)) {
      return sendJson(response, 403, { message: "Submit this form from this website." });
    }
    const body = requireJsonObject(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    // Always the same answer, so this cannot be used to discover registered
    // addresses. A missing account simply has no token created for it.
    const answer = { message: "If that email has an account, a reset link is on its way." };

    const retryAfter = rateLimit(resetAttempts, email);
    if (retryAfter) {
      response.setHeader("Retry-After", retryAfter);
      return sendJson(response, 429, { message: "Too many reset requests. Try again in a minute." });
    }

    const record = email ? await accounts.find(email) : null;
    if (!record) return sendJson(response, 200, answer);

    const now = Date.now();
    pruneResets(now);
    const token = randomBytes(32).toString("hex");
    resetTokens.set(token, { email: record.email, expiresAt: now + resetDuration });

    if (mailer) {
      const link = `${expectedOrigin(request)}/forgot-password.html?token=${token}`;
      Promise.resolve().then(() => mailer.send("reset", { ...record, resetLink: link, resetToken: token }))
        .catch((error) => {
          console.error("Could not send reset email for %s: %s", recordReference(record), error.message);
        });
    } else {
      // Without a mailer the link cannot be delivered, so say so in the log
      // rather than leaving an operator guessing why no email arrived.
      console.warn("Password reset requested but no mailer is configured; set EMAILJS_* to deliver it.");
    }
    return sendJson(response, 200, answer);
  }

  async function completeReset(request, response) {
    if (!sameOrigin(request)) {
      return sendJson(response, 403, { message: "Submit this form from this website." });
    }
    const body = requireJsonObject(request);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const entry = /^[0-9a-f]{64}$/i.test(token) ? resetTokens.get(token) : null;
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) resetTokens.delete(token);
      return sendJson(response, 400, {
        message: "That reset link has expired. Request a new one."
      });
    }
    if (password.length < 8 || password.length > 128) {
      return sendJson(response, 422, {
        message: "Check the form details.",
        errors: { password: "Use a password between 8 and 128 characters." }
      });
    }

    const record = await accounts.find(entry.email);
    if (!record) {
      resetTokens.delete(token);
      return sendJson(response, 400, { message: "That reset link is no longer valid." });
    }

    await accounts.updatePassword(entry.email, await hashPassword(password));
    // Single use, and every existing session for the account is dropped so a
    // stolen session cannot outlive the password it was created with.
    resetTokens.delete(token);
    dropSessionsFor(entry.email);
    signInAttempts.delete(entry.email);
    resetAttempts.delete(entry.email);
    return sendJson(response, 200, { message: "Your password is updated. Sign in with it now." });
  }

  return {
    register, signIn, signOut, currentAccount, myBookings,
    requestReset, completeReset, sessionEmail, requestError
  };
}
