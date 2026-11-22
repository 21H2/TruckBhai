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

export { isJsonRequest, requireJsonObject, requestError, sendJson };
