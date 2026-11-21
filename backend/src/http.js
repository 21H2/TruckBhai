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

export { readJson, requestError, sendJson };
