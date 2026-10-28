"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createApp } = require("../server.js");
const { validate, localDate } = require("../js/booking.js");
const forms = require("../js/forms.js");

const validBooking = {
  vehicle: "tata-ace", pickup: "Chennai warehouse", pickupDate: "2099-06-10", returnDate: "2099-06-11"
};

async function setup(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "truckbhai-test-"));
  const app = createApp({ dataDir });
  t.after(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    request: (url, options) => request(app, url, options),
    post: (body) => request(app, "/api/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    })
  };
}

// Exercise the real HTTP handler and filesystem without requiring an open port.
// Request bodies are readable streams, as they are with Node's IncomingMessage.
async function request(app, url, options = {}) {
  const incoming = Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)]);
  incoming.url = url;
  incoming.method = options.method || "GET";
  incoming.headers = { host: "127.0.0.1:3000" };
  for (const [name, value] of Object.entries(options.headers || {})) {
    incoming.headers[name.toLowerCase()] = value;
  }
  return new Promise((resolve, reject) => {
    const headers = {};
    const outgoing = {
      destroyed: false,
      status: 200,
      setHeader(name, value) { headers[name] = value; },
      writeHead(status, values) { this.status = status; Object.assign(headers, values); },
      end(body) { resolve(new Response(body, { status: this.status, headers })); }
    };
    const handler = app.listeners("request")[0];
    handler(incoming, outgoing).catch(reject);
  });
}

test("booking rules reject unknown trucks, whitespace locations, past and invalid dates", () => {
  assert.deepEqual(validate(validBooking, "2026-10-28").errors, {});
  assert.equal(localDate(new Date(2026, 9, 28)), "2026-10-28");
  const invalidInputs = [
    [{ vehicle: "unknown" }, "vehicle"], [{ pickup: "  " }, "pickup"],
    [{ pickup: "a".repeat(201) }, "pickup"], [{ pickup: { city: "Chennai" } }, "pickup"],
    [{ pickupDate: "2026-10-27" }, "pickupDate"], [{ pickupDate: "2099-02-29" }, "pickupDate"],
    [{ returnDate: "2099-06-10" }, "returnDate"], [{ returnDate: "2099-06-09" }, "returnDate"],
    [{ returnDate: "2099-13-01" }, "returnDate"]
  ];
  for (const [changes, field] of invalidInputs) {
    assert.ok(validate({ ...validBooking, ...changes }, "2026-10-28").errors[field], field);
  }
  assert.equal(Object.keys(validate(null).errors).length, 4);
});

test("a successful booking is normalized, saved, and persists across server instances", async (t) => {
  const { dataDir, post } = await setup(t);
  const response = await post({ ...validBooking, pickup: " Chennai warehouse ", id: "forged" });
  assert.equal(response.status, 201);
  const result = await response.json();
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, "bookings.json"), "utf8"));
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], { ...validBooking, id: result.id, submittedAt: saved[0].submittedAt });
  assert.match(result.id, /^[a-f0-9-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(saved[0].submittedAt)));

  const second = createApp({ dataDir });
  const next = await request(second, "/api/bookings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validBooking)
  });
  assert.equal(next.status, 201);
  assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, "bookings.json"), "utf8")).length, 2);
});

test("invalid submissions do not create a data file", async (t) => {
  const { dataDir, post } = await setup(t);
  const response = await post({ ...validBooking, returnDate: validBooking.pickupDate });
  assert.equal(response.status, 422);
  assert.ok((await response.json()).errors.returnDate);
  await assert.rejects(fs.readFile(path.join(dataDir, "bookings.json")), { code: "ENOENT" });
});

test("simultaneous bookings all survive in a valid JSON array", async (t) => {
  const { dataDir, post } = await setup(t);
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => post({
    ...validBooking, pickup: `Warehouse ${i}`
  })));
  assert.ok(responses.every((response) => response.status === 201));
  const records = JSON.parse(await fs.readFile(path.join(dataDir, "bookings.json"), "utf8"));
  assert.equal(records.length, 20);
  assert.equal(new Set(records.map((record) => record.id)).size, 20);
  assert.equal(new Set(records.map((record) => record.pickup)).size, 20);
});

test("malformed, oversized, wrong-content and cross-origin requests are rejected", async (t) => {
  const { request } = await setup(t);
  for (const [body, headers, expected] of [
    ["{", { "Content-Type": "application/json" }, 400],
    ["[]", { "Content-Type": "application/json" }, 400],
    ["x".repeat(33000), { "Content-Type": "application/json" }, 413],
    [JSON.stringify(validBooking), { "Content-Type": "text/plain" }, 415],
    [JSON.stringify(validBooking), { "Content-Type": "application/json", Origin: "https://example.com" }, 403]
  ]) {
    const response = await request("/api/bookings", { method: "POST", body, headers });
    assert.equal(response.status, expected);
  }
});

test("storage failure preserves the file and later submissions can recover", async (t) => {
  const { dataDir, post } = await setup(t);
  const filename = path.join(dataDir, "bookings.json");
  await fs.writeFile(filename, "broken json");
  assert.equal((await post(validBooking)).status, 500);
  assert.equal(await fs.readFile(filename, "utf8"), "broken json");
  await fs.writeFile(filename, "[]");
  assert.equal((await post(validBooking)).status, 201);
  assert.deepEqual((await fs.readdir(dataDir)), ["bookings.json"]);
});

test("site assets are available but data, server code and Git metadata stay private", async (t) => {
  const { request, post } = await setup(t);
  await post(validBooking);
  for (const file of ["/", "/contact.html", "/css/styles.css", "/js/booking.js", "/images/icon-calendar.svg"]) {
    assert.equal((await request(file)).status, 200, file);
  }
  for (const file of ["/data/bookings.json", "/server.js", "/.git/config", "/package.json", "/missing.html"]) {
    assert.equal((await request(file)).status, 404, file);
  }
  assert.equal((await request("/api/bookings")).status, 405);
});

test("contact validation rejects invalid values and preserves multiline messages", () => {
  const message = { name: "Asha Kumar", email: "asha@example.com", message: "Please call me.\nI need a truck." };
  assert.deepEqual(forms.contact(message).errors, {});
  assert.equal(forms.contact(message).values.message, message.message);
  for (const [changes, field] of [
    [{ name: " " }, "name"], [{ name: "x".repeat(101) }, "name"],
    [{ email: "not-an-email" }, "email"], [{ email: "a@@example.com" }, "email"],
    [{ message: " " }, "message"], [{ message: "x".repeat(5001) }, "message"]
  ]) {
    assert.ok(forms.contact({ ...message, ...changes }).errors[field], field);
  }
});

test("contact submissions save to their own file and invalid requests save nothing", async (t) => {
  const { dataDir, request, post } = await setup(t);
  const send = (body) => request("/api/contacts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const bad = await send({ name: " ", email: "wrong", message: "" });
  assert.equal(bad.status, 422);
  assert.equal(Object.keys((await bad.json()).errors).length, 3);
  await assert.rejects(fs.readFile(path.join(dataDir, "contacts.json")), { code: "ENOENT" });
  const response = await send({ name: " Asha Kumar ", email: " asha@example.com ", message: " Please send rental details. " });
  assert.equal(response.status, 201);
  const contacts = JSON.parse(await fs.readFile(path.join(dataDir, "contacts.json"), "utf8"));
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].name, "Asha Kumar");
  assert.equal(contacts[0].message, "Please send rental details.");
  assert.equal(contacts[0].id, (await response.json()).id);
  await post(validBooking);
  assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, "bookings.json"), "utf8")).length, 1);
  assert.equal((await request("/data/contacts.json")).status, 404);
});
