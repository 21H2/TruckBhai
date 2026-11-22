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

// The origin a browser should send. Behind a reverse proxy request.protocol is
// only trustworthy once "trust proxy" is set, and the forwarded header can be
// absent, so an explicit PUBLIC_ORIGIN always wins when it is configured.
function expectedOrigin(request, env = process.env) {
  const configured = env.PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return request.protocol + "://" + request.headers.host;
}

// A state-changing request must come from this site. A missing Origin is allowed
// because non-browser clients omit it and the JSON content type already blocks
// cross-site HTML form posts.
function sameOrigin(request, env = process.env) {
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  if (!request.headers.origin) return true;
  return request.headers.origin === expectedOrigin(request, env);
}

function isJsonRequest(request) {
  return request.headers["content-type"]?.split(";")[0].trim().toLowerCase() === "application/json";
}

function requireJsonObject(request) {
  if (!isJsonRequest(request)) {
    throw requestError(415, "Send form data as JSON.");
  }
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    throw requestError(400, "Send a valid JSON object.");
  }
  return request.body;
}

export { isJsonRequest, requireJsonObject, requestError, sendJson, expectedOrigin, sameOrigin };
