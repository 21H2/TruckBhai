import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { businessToday } from "../src/today.js";
import { hashPassword } from "../src/passwords.js";

const password = "admin test password";
const passwordHash = await hashPassword(password);

async function harness(t, admin = { passwordHash }) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "truckbhai-summary-"));
  const app = createApp({ dataDir, admin });
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  async function call(url, { method = "GET", body, cookie } = {}) {
    const server = app.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const base = `http://127.0.0.1:${server.address().port}`;
      const headers = { Origin: base };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(base + url, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual"
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        cookie: (response.headers.getSetCookie?.() || []).map(v => v.split(";")[0]).join("; "),
        body: text ? JSON.parse(text) : null
      };
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }

  const signIn = async () => (await call("/api/v1/admin/login", {
    method: "POST", body: { password }
  })).cookie;

  return { call, signIn };
}

test("either admin bcrypt password signs in without truncating the input", async (t) => {
  const secondPassword = "é".repeat(36);
  const secondPasswordHash = await hashPassword(secondPassword);
  const { call } = await harness(t, { passwordHash, secondPasswordHash });
  for (const [input, status] of [[password, 200], [secondPassword, 200], [secondPassword + "x", 401]]) {
    const response = await call("/api/v1/admin/login", { method: "POST", body: { password: input } });
    assert.equal(response.status, status);
  }
});

test("the admin summary needs a signed-in admin", async (t) => {
  const { call } = await harness(t);
  const anonymous = await call("/api/v1/admin/summary");
  assert.equal(anonymous.status, 401);

  const forged = await call("/api/v1/admin/summary", {
    cookie: "truckbhai_admin=" + "a".repeat(64)
  });
  assert.equal(forged.status, 401);
});

test("the summary counts bookings, revenue, stages and vehicles", async (t) => {
  const { call, signIn } = await harness(t);
  const cookie = await signIn();

  const booking = {
    vehicle: "tata-ace", pickup: "Chennai depot",
    pickupDate: "2099-06-10", returnDate: "2099-06-11"
  };
  for (let made = 0; made < 2; made++) {
    assert.equal((await call("/api/v1/bookings", { method: "POST", body: booking })).status, 201);
  }
  assert.equal((await call("/api/v1/bookings", {
    method: "POST", body: { ...booking, vehicle: "eicher-19" }
  })).status, 201);
  await call("/api/v1/contacts", {
    method: "POST",
    body: { name: "Someone", email: "someone@example.com", message: "A message long enough." }
  });
  await call("/api/v1/subscribers", { method: "POST", body: { email: "news@example.com" } });

  const summary = (await call("/api/v1/admin/summary", { cookie })).body;

  assert.equal(summary.totals.bookings, 3);
  assert.equal(summary.totals.contacts, 1);
  assert.equal(summary.totals.subscribers, 1);
  assert.equal(summary.totals.accounts, 0);
  // Future pickup dates, so every booking is upcoming.
  assert.equal(summary.stages.upcoming, 3);
  assert.equal(summary.stages.active, 0);
  assert.equal(summary.stages.completed, 0);

  const mix = new Map(summary.vehicles.map(row => [row.vehicle, row.count]));
  assert.equal(mix.get("tata-ace"), 2);
  assert.equal(mix.get("eicher-19"), 1);
  // Sorted so the chart shows the most booked vehicle first.
  assert.equal(summary.vehicles[0].vehicle, "tata-ace");
});

test("the summary always returns 14 days, oldest first, ending today", async (t) => {
  const { call, signIn } = await harness(t);
  const cookie = await signIn();
  await call("/api/v1/bookings", {
    method: "POST",
    body: { vehicle: "tata-ace", pickup: "Chennai depot", pickupDate: "2099-06-10", returnDate: "2099-06-11" }
  });

  const summary = (await call("/api/v1/admin/summary", { cookie })).body;
  assert.equal(summary.byDay.length, 14);
  const dates = summary.byDay.map(point => point.date);
  assert.deepEqual([...dates].sort(), dates, "days must be in ascending order");
  // The axis ends on the business timezone's today, not the UTC date: those
  // disagree for 5.5 hours every day in IST.
  assert.equal(dates[13], businessToday());
  // The booking was created now, so it lands on the final day.
  assert.equal(summary.byDay[13].count, 1);
  assert.equal(summary.byDay[0].count, 0);
  assert.equal(summary.capped, false);
});

test("the summary separates signed-in bookings from anonymous ones", async (t) => {
  const { call, signIn } = await harness(t);
  const account = { name: "Umesh Sharma", email: "umesh@example.com", password: "correct horse 9" };
  const registered = await call("/api/v1/account/register", { method: "POST", body: account });
  const booking = {
    vehicle: "tata-ace", pickup: "Chennai depot",
    pickupDate: "2099-06-10", returnDate: "2099-06-11"
  };
  await call("/api/v1/bookings", { method: "POST", body: booking, cookie: registered.cookie });
  await call("/api/v1/bookings", { method: "POST", body: booking });

  const summary = (await call("/api/v1/admin/summary", { cookie: await signIn() })).body;
  assert.equal(summary.totals.bookings, 2);
  assert.equal(summary.totals.attributed, 1);
  assert.equal(summary.totals.anonymous, 1);
  assert.equal(summary.totals.accounts, 1);
});

test("the summary is empty rather than broken before anything is saved", async (t) => {
  const { call, signIn } = await harness(t);
  const summary = (await call("/api/v1/admin/summary", { cookie: await signIn() })).body;

  assert.deepEqual(summary.totals,
    { bookings: 0, contacts: 0, subscribers: 0, accounts: 0, attributed: 0, anonymous: 0 });
  assert.equal(summary.revenue, 0);
  assert.deepEqual(summary.vehicles, []);
  assert.equal(summary.byDay.length, 14);
  assert.ok(summary.byDay.every(point => point.count === 0));
});

test("the summary endpoint answers only GET", async (t) => {
  const { call, signIn } = await harness(t);
  const response = await call("/api/v1/admin/summary", { method: "POST", body: {}, cookie: await signIn() });
  assert.equal(response.status, 405);
});
