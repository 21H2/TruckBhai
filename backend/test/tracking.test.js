import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../src/app.js";

const validBooking = {
  vehicle: "tata-ace", pickup: "Chennai warehouse", pickupDate: "2099-06-10", returnDate: "2099-06-11"
};

async function request(app, url, options = {}) {
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      ...options, redirect: "manual"
    });
    const body = response.body ? await response.arrayBuffer() : null;
    return new Response(body, { status: response.status, headers: response.headers });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function setup(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "truckbhai-track-"));
  const app = createApp({ dataDir });
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  return {
    get: (url) => request(app, url),
    post: (body) => request(app, "/api/v1/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    })
  };
}

test("a saved booking can be tracked with its reference", async (t) => {
  const { get, post } = await setup(t);
  const created = await post(validBooking);
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const tracked = await get(`/api/v1/bookings/${id}`);
  assert.equal(tracked.status, 200);
  const { booking } = await tracked.json();
  assert.equal(booking.id, id);
  assert.equal(booking.vehicle, "tata-ace");
  assert.equal(booking.pickup, "Chennai warehouse");
  assert.equal(booking.pickupDate, "2099-06-10");
  // Dates are in the future, so the derived stage must be upcoming.
  assert.equal(booking.stage, "upcoming");
  assert.equal(tracked.headers.get("cache-control"), "no-store");
});

test("tracking never exposes fields outside the allowed list", async (t) => {
  const { get, post } = await setup(t);
  const { id } = await (await post(validBooking)).json();
  const { booking } = await (await get(`/api/v1/bookings/${id}`)).json();

  const allowed = ["id", "submittedAt", "vehicle", "pickup", "dropoff",
    "pickupDate", "returnDate", "estimatedFareInr", "stage"];
  for (const key of Object.keys(booking)) {
    assert.ok(allowed.includes(key), `${key} must not be returned to a tracking request`);
  }
  assert.equal(booking.pickupCoordinates, undefined);
  assert.equal(booking.fareInputs, undefined);
});

test("an unknown reference is a 404 and a malformed one is a 400", async (t) => {
  const { get } = await setup(t);

  const missing = await get("/api/v1/bookings/11111111-2222-4333-8444-555555555555");
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).message, /No booking matches/);

  for (const bad of ["abc", "1", "not-a-uuid"]) {
    const response = await get("/api/v1/bookings/" + encodeURIComponent(bad));
    assert.equal(response.status, 400, bad);
  }
});

test("path traversal in a reference never reaches a file", async (t) => {
  const { get } = await setup(t);
  // These do not match the single-segment :reference route, so they fall through
  // to the static handler and 404 rather than returning 400.
  for (const attempt of ["../../bookings.json", "..%2F..%2Fbookings.json", "..%2f..%2fpackage.json"]) {
    const response = await get("/api/v1/bookings/" + attempt);
    assert.equal(response.status, 404, attempt);
    const body = await response.text();
    assert.ok(!body.includes("pickupDate"), "a tracking lookup must never return stored records");
    assert.ok(!body.includes("dependencies"), "a tracking lookup must never return project files");
  }
});

test("tracking a booking before any have been saved returns 404, not an error", async (t) => {
  const { get } = await setup(t);
  const response = await get("/api/v1/bookings/11111111-2222-4333-8444-555555555555");
  assert.equal(response.status, 404);
});

test("the tracking path only answers GET", async (t) => {
  const { get, post } = await setup(t);
  const { id } = await (await post(validBooking)).json();

  const put = await request(createApp({ dataDir: "/tmp" }), `/api/v1/bookings/${id}`, { method: "PUT" });
  assert.equal(put.status, 405);
  assert.equal(put.headers.get("allow"), "GET");

  // The collection path still accepts POST for new bookings.
  assert.equal((await get(`/api/v1/bookings/${id}`)).status, 200);
});

test("the unversioned booking path tracks the same reference", async (t) => {
  const { get, post } = await setup(t);
  const { id } = await (await post(validBooking)).json();
  const response = await get(`/api/bookings/${id}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).booking.id, id);
});
