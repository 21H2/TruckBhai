// Regression tests for the audit findings, so none of them can come back quietly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { businessToday, businessDate, recentDays } from "../src/today.js";
import { sameOrigin, expectedOrigin } from "../src/http.js";
import { estimateFare } from "../../frontend/js/booking.js";
import { createFuelLookup } from "../src/fuel.js";

// --- H-3: the fare must depend on distance for diesel trucks ---------------

test("a diesel truck is priced on distance, not a flat daily rate", () => {
  const truck = {
    dailyRateInr: 3800, fuelType: "diesel",
    mileageKmPerLitre: 4.5, pricePerLitre: 95.2
  };
  const near = estimateFare(truck, 138, "2099-06-10", "2099-06-12");
  const far = estimateFare(truck, 328, "2099-06-10", "2099-06-12");

  assert.ok(Number.isFinite(near) && Number.isFinite(far),
    "a diesel vehicle must produce a fare, not null");
  assert.ok(far > near, `a longer trip must cost more: ${far} should exceed ${near}`);
  // 2 days of hire plus fuel for the distance.
  assert.equal(near, Math.round(2 * 3800 + 138 / 4.5 * 95.2));
});

test("an electric vehicle still skips fuel, and an unpriceable one returns null", () => {
  const electric = { dailyRateInr: 2000, fuelType: "electric" };
  assert.equal(estimateFare(electric, 328, "2099-06-10", "2099-06-11"), 2000);

  // Missing mileage or price cannot silently become a free trip.
  const broken = { dailyRateInr: 2000, fuelType: "diesel", mileageKmPerLitre: null, pricePerLitre: 95 };
  assert.equal(estimateFare(broken, 328, "2099-06-10", "2099-06-11"), null);
  const noDistance = { dailyRateInr: 2000, fuelType: "diesel", mileageKmPerLitre: 4, pricePerLitre: 95 };
  assert.equal(estimateFare(noDistance, null, "2099-06-10", "2099-06-11"), null);
});

test("the fleet gives every vehicle a real fuel type and mileage", async () => {
  const lookup = createFuelLookup(null, async () => { throw new Error("offline"); });
  const ids = ["tata-ace", "eicher-pro", "eicher-19", "container", "trailer", "refrigerated"];
  const rates = [];
  for (const id of ids) {
    const rate = await lookup(new URLSearchParams({ vehicle: id, city: "Chennai", pricing: "1" }));
    rates.push([id, rate]);
    assert.ok(["petrol", "diesel"].includes(rate.fuelType), `${id} should burn fuel, got ${rate.fuelType}`);
    assert.ok(rate.mileageKmPerLitre > 0, `${id} needs a mileage, got ${rate.mileageKmPerLitre}`);
    assert.ok(rate.dailyRateInr > 0, `${id} needs a daily rate`);
    // Every vehicle must now produce a distance-dependent fare.
    const fare = estimateFare(rate, 300, "2099-06-10", "2099-06-11");
    assert.ok(Number.isFinite(fare), `${id} must produce a fare`);
  }
  // A 32 ft trailer cannot cost the same per day as a mini truck.
  const daily = new Map(rates.map(([id, rate]) => [id, rate.dailyRateInr]));
  assert.ok(daily.get("trailer") > daily.get("tata-ace"),
    "vehicle classes must not share one flat daily rate");
});

test("a diesel vehicle is priced from the diesel pump price", async () => {
  const snapshot = {
    success: true,
    data: { date: "2026-11-20", petrol: { delhi: 102.12, chennai: 107.77 }, diesel: { delhi: 95.2, chennai: 99.55 } }
  };
  const lookup = createFuelLookup(null, async () => ({ ok: true, json: async () => snapshot }));

  const diesel = await lookup(new URLSearchParams({ vehicle: "eicher-19", city: "Chennai" }));
  assert.equal(diesel.pricePerLitre, 99.55, "a diesel truck must use the diesel price");
  const petrol = await lookup(new URLSearchParams({ vehicle: "tata-ace", city: "Chennai" }));
  assert.equal(petrol.pricePerLitre, 107.77, "the petrol Ace must use the petrol price");
});

// --- H-4 / M-8: dates in the business timezone -----------------------------

test("today is the business date, not the UTC date", () => {
  // 20:00 UTC is already the next calendar day in IST.
  const instant = new Date("2026-11-22T20:00:00Z");
  assert.equal(instant.toISOString().slice(0, 10), "2026-11-22");
  assert.equal(businessToday(instant, { BUSINESS_TIMEZONE: "Asia/Kolkata" }), "2026-11-23");
  assert.equal(businessToday(instant, { BUSINESS_TIMEZONE: "UTC" }), "2026-11-22");
});

test("a stored timestamp buckets into its business day", () => {
  const env = { BUSINESS_TIMEZONE: "Asia/Kolkata" };
  assert.equal(businessDate("2026-11-22T20:00:00Z", env), "2026-11-23");
  assert.equal(businessDate("2026-11-22T10:00:00Z", env), "2026-11-22");
  assert.equal(businessDate("not a date", env), null);
});

test("an invalid timezone falls back instead of throwing", () => {
  assert.match(businessToday(new Date(), { BUSINESS_TIMEZONE: "Not/AZone" }), /^\d{4}-\d{2}-\d{2}$/);
});

test("the recent-day axis ends on the business today and is contiguous", () => {
  const env = { BUSINESS_TIMEZONE: "Asia/Kolkata" };
  const days = recentDays(14, new Date("2026-11-22T20:00:00Z"), env);
  assert.equal(days.length, 14);
  assert.equal(days[13], "2026-11-23");
  assert.equal(days[0], "2026-11-10");
  for (let index = 1; index < days.length; index++) {
    const gap = Date.parse(days[index] + "T00:00:00Z") - Date.parse(days[index - 1] + "T00:00:00Z");
    assert.equal(gap, 86_400_000, "days must be consecutive");
  }
});

// --- H-1: the origin check behind a proxy ----------------------------------

test("the expected origin honours PUBLIC_ORIGIN over the request protocol", () => {
  const request = { protocol: "http", headers: { host: "truckbhai.example" } };
  assert.equal(expectedOrigin(request, {}), "http://truckbhai.example");
  assert.equal(
    expectedOrigin(request, { PUBLIC_ORIGIN: "https://truckbhai.example" }),
    "https://truckbhai.example");
  // A trailing slash in configuration must not break the comparison.
  assert.equal(
    expectedOrigin(request, { PUBLIC_ORIGIN: "https://truckbhai.example/" }),
    "https://truckbhai.example");
});

test("an HTTPS browser post is accepted once PUBLIC_ORIGIN is set", () => {
  const env = { PUBLIC_ORIGIN: "https://truckbhai.example" };
  const proxied = {
    protocol: "http",
    headers: { host: "truckbhai.example", origin: "https://truckbhai.example" }
  };
  // This is the production case that used to 403 on every form.
  assert.equal(sameOrigin(proxied, env), true);

  const crossSite = {
    protocol: "http",
    headers: { host: "truckbhai.example", origin: "https://evil.example" }
  };
  assert.equal(sameOrigin(crossSite, env), false);

  const fetchMetadata = {
    protocol: "https",
    headers: { host: "truckbhai.example", origin: "https://truckbhai.example", "sec-fetch-site": "cross-site" }
  };
  assert.equal(sameOrigin(fetchMetadata, env), false);
});

// --- H-2: a flood of signups must not sign existing customers out ----------

test("registering repeatedly never invalidates an existing customer session", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "truckbhai-sessions-"));
  const app = createApp({ dataDir });
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body, cookie) => fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });

  try {
    const first = await post("/api/v1/account/register", {
      name: "Umesh Sharma", email: "umesh@example.com", password: "correct horse 9"
    });
    assert.equal(first.status, 201);
    const cookie = first.headers.getSetCookie()[0].split(";")[0];

    // Well past the per-client signup allowance.
    let throttled = 0;
    for (let attempt = 0; attempt < 14; attempt++) {
      const response = await post("/api/v1/account/register", {
        name: "Someone Else", email: `flood${attempt}@example.com`, password: "another pass 12"
      });
      if (response.status === 429) throttled++;
      await response.body?.cancel();
    }
    assert.ok(throttled > 0, "repeated signups from one client must be rate limited");

    // The original session must still work.
    const me = await fetch(base + "/api/v1/account/me", { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).account.email, "umesh@example.com");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("registering replaces a session the visitor already carried", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "truckbhai-fixation-"));
  const app = createApp({ dataDir });
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(base + "/api/v1/account/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ name: "First Person", email: "first@example.com", password: "correct horse 9" })
    });
    const planted = first.headers.getSetCookie()[0].split(";")[0];

    const second = await fetch(base + "/api/v1/account/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base, Cookie: planted },
      body: JSON.stringify({ name: "Second Person", email: "second@example.com", password: "another pass 12" })
    });
    assert.equal(second.status, 201);
    await second.body?.cancel();

    // The planted token must no longer identify anybody.
    const reused = await fetch(base + "/api/v1/account/me", { headers: { Cookie: planted } });
    assert.equal(reused.status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

// --- M-6 / M-13: headers and crawler files ---------------------------------

test("site pages carry baseline security headers", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "truckbhai-headers-"));
  const app = createApp({ dataDir });
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + "/index.html");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("permissions-policy"), /geolocation=\(\)/);
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
    await response.body?.cancel();

    for (const [file, type] of [["/robots.txt", /text\/plain/], ["/sitemap.xml", /application\/xml/]]) {
      const crawler = await fetch(base + file);
      assert.equal(crawler.status, 200, file);
      assert.match(crawler.headers.get("content-type"), type);
      const body = await crawler.text();
      assert.ok(body.length > 0, file + " must not be empty");
      if (file === "/robots.txt") assert.match(body, /Disallow: \/admin/);
    }

    // Submissions stay unreachable even though root files are now served.
    for (const blocked of ["/backend/data/users.json", "/data/users.json", "/package.json"]) {
      const response = await fetch(base + blocked);
      assert.equal(response.status, 404, blocked);
      await response.body?.cancel();
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
