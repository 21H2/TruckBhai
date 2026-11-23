// Customer registration, sign-in, profile, bookings, and password reset.
import { randomBytes, randomUUID } from "node:crypto";
import * as forms from "../../../frontend/js/forms.js";
import { requireJsonObject, requestError, sendJson, expectedOrigin, sameOrigin } from "../http.js";
import { createAccountStore, createBookingReader } from "../accounts.js";
import { businessToday } from "../today.js";
import { recordReference } from "../records.js";
import { createAccountSessions } from "../account-sessions.js";
import { hashPassword, passwordMatches } from "../passwords.js";

export function createAccountController({ dataDir, models, mailer, secureCookie = false }) {
  const accounts = createAccountStore({ dataDir, models });
  const listBookings = createBookingReader({ dataDir, models });
  const { startSession, endSession, dropSessionsFor, sessionEmail } = createAccountSessions(secureCookie);
  const signInAttempts = new Map();
  const resetAttempts = new Map();
  const registerAttempts = new Map();
  const resetTokens = new Map();
  const resetDuration = 30 * 60 * 1000;

  function pruneResets(now) {
    for (const [token, entry] of resetTokens) {
      if (entry.expiresAt <= now) resetTokens.delete(token);
    }
    while (resetTokens.size >= 200) resetTokens.delete(resetTokens.keys().next().value);
  }
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
    if (!startSession(request, response, record.email)) {
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
    if (!startSession(request, response, record.email)) {
      return sendJson(response, 503, { message: "Sign-in is busy right now. Try again shortly." });
    }
    return sendJson(response, 200, { message: "Signed in.", account: profile(record) });
  }

  function signOut(request, response) {
    if (!sameOrigin(request)) {
      return sendJson(response, 403, { message: "Submit this request from this website." });
    }
    endSession(request, response);
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
    const passwordError = forms.newPasswordError(password);
    if (passwordError) {
      return sendJson(response, 422, {
        message: "Check the form details.",
        errors: { password: passwordError }
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
