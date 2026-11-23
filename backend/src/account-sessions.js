import { randomBytes } from "node:crypto";

const sessionDuration = 7 * 24 * 60 * 60;
const maxSessions = 500;

// Sessions are held in memory and end when the process restarts.
export function createAccountSessions(secureCookie) {
  const sessions = new Map();
  const cookieName = secureCookie ? "__Host-truckbhai_account" : "truckbhai_account";
  const cookieFlags = "Path=/; HttpOnly; SameSite=Strict" + (secureCookie ? "; Secure" : "");
  const cookiePattern = new RegExp(`(?:^|; *)${cookieName}=([0-9a-f]{64})(?:;|$)`);

  function setCookie(response, token, maxAge) {
    response.setHeader("Set-Cookie", `${cookieName}=${token}; Max-Age=${maxAge}; ${cookieFlags}`);
  }

  function readToken(request) {
    return request.headers.cookie?.match(cookiePattern)?.[1];
  }

  function startSession(request, response, email) {
    // Rotate the token on sign-in or registration to prevent session fixation.
    sessions.delete(readToken(request));

    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    // Preserve live sessions when the table reaches capacity.
    if (sessions.size >= maxSessions) return false;

    const token = randomBytes(32).toString("hex");
    sessions.set(token, { email, expiresAt: now + sessionDuration * 1000 });
    setCookie(response, token, sessionDuration);
    return true;
  }

  function endSession(request, response) {
    sessions.delete(readToken(request));
    setCookie(response, "", 0);
  }

  function dropSessionsFor(email) {
    for (const [token, session] of sessions) {
      if (session.email === email) sessions.delete(token);
    }
  }

  function sessionEmail(request) {
    const token = readToken(request);
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session.email;
  }

  return { startSession, endSession, dropSessionsFor, sessionEmail };
}
