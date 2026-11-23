import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { registration, credentials } from "../../frontend/js/forms.js";

const account = {
  name: "Umesh Sharma", email: "umesh@example.com",
  phone: "+91 99349 49572", password: "correct horse 9"
};

function cookieFrom(response) {
  return (response.headers.getSetCookie?.() || [])
    .map(value => value.split(";")[0]).join("; ");
}

async function harness(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "truckbhai-account-"));
  const app = createApp({ dataDir });
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  async function call(url, { method = "GET", body, cookie } = {}) {
    const server = app.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const base = `http://127.0.0.1:${server.address().port}`;
      const headers = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (cookie) headers.Cookie = cookie;
      headers.Origin = base;
      const response = await fetch(base + url, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual"
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        cookie: cookieFrom(response),
        body: text ? JSON.parse(text) : null
      };
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }

  return { dataDir, call };
}

test("registration validation is shared by the browser and the server", () => {
  assert.deepEqual(registration(account).errors, {});
  assert.ok(registration({ ...account, password: "short" }).errors.password);
  assert.deepEqual(registration({ ...account, password: "é".repeat(36) }).errors, {});
  assert.ok(registration({ ...account, password: "é".repeat(37) }).errors.password);
  assert.ok(registration({ ...account, email: "not-an-email" }).errors.email);
  assert.ok(registration({ ...account, name: "x" }).errors.name);
  assert.ok(registration({ ...account, phone: "abc" }).errors.phone);
  // A blank phone number is allowed; the field is optional.
  assert.deepEqual(registration({ ...account, phone: "" }).errors, {});
  // Email is normalised so Umesh@Example.com and umesh@example.com are one account.
  assert.equal(registration({ ...account, email: "Umesh@Example.COM" }).values.email, "umesh@example.com");
  assert.ok(credentials({ email: account.email, password: "" }).errors.password);
});

test("registering creates a session and never stores the password", async (t) => {
  const { call, dataDir } = await harness(t);
  const created = await call("/api/v1/account/register", { method: "POST", body: account });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.account, {
    name: account.name, email: account.email, phone: account.phone
  });
  assert.ok(created.cookie.includes("truckbhai_account="), "a session cookie must be set");

  const setCookie = created.headers.getSetCookie()[0];
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\//);

  const stored = JSON.parse(await fs.readFile(path.join(dataDir, "users.json"), "utf8"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].password, undefined, "the plaintext password must never be stored");
  assert.match(stored[0].passwordHash, /^\$2b\$12\$[./A-Za-z0-9]{53}$/);
  assert.ok(!JSON.stringify(stored).includes(account.password));
});

test("the same email cannot register twice, including a different case", async (t) => {
  const { call } = await harness(t);
  assert.equal((await call("/api/v1/account/register", { method: "POST", body: account })).status, 201);

  for (const email of [account.email, "UMESH@example.com"]) {
    const again = await call("/api/v1/account/register", {
      method: "POST", body: { ...account, email, name: "Someone Else" }
    });
    assert.equal(again.status, 409, email);
    assert.ok(again.body.errors.email);
  }
});

test("sign in rejects a wrong password and does not reveal which emails exist", async (t) => {
  const { call } = await harness(t);
  await call("/api/v1/account/register", { method: "POST", body: account });

  const wrongPassword = await call("/api/v1/account/login", {
    method: "POST", body: { email: account.email, password: "not the password" }
  });
  const unknownEmail = await call("/api/v1/account/login", {
    method: "POST", body: { email: "nobody@example.com", password: "not the password" }
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  // Identical responses, so the endpoint cannot be used to enumerate accounts.
  assert.equal(wrongPassword.body.message, unknownEmail.body.message);
});

test("a correct password returns a working session that logout ends", async (t) => {
  const { call } = await harness(t);
  await call("/api/v1/account/register", { method: "POST", body: account });

  const signedIn = await call("/api/v1/account/login", {
    method: "POST", body: { email: "Umesh@Example.com", password: account.password }
  });
  assert.equal(signedIn.status, 200);

  const me = await call("/api/v1/account/me", { cookie: signedIn.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.account.email, account.email);
  assert.equal(me.body.account.passwordHash, undefined, "never expose the stored hash");

  const out = await call("/api/v1/account/logout", { method: "POST", body: {}, cookie: signedIn.cookie });
  assert.equal(out.status, 200);
  assert.equal((await call("/api/v1/account/me", { cookie: signedIn.cookie })).status, 401);
});

test("the account endpoints refuse an unauthenticated caller", async (t) => {
  const { call } = await harness(t);
  for (const url of ["/api/v1/account/me", "/api/v1/account/bookings"]) {
    const response = await call(url);
    assert.equal(response.status, 401, url);
    assert.match(response.body.message, /Sign in/);
  }
  // A forged cookie value is not a session.
  const forged = await call("/api/v1/account/me", { cookie: "truckbhai_account=" + "a".repeat(64) });
  assert.equal(forged.status, 401);
});

test("six wrong sign-in attempts are rate limited", async (t) => {
  const { call } = await harness(t);
  await call("/api/v1/account/register", { method: "POST", body: account });

  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    last = await call("/api/v1/account/login", {
      method: "POST", body: { email: account.email, password: "wrong one" }
    });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("retry-after")) > 0);
});

test("a booking made while signed in appears only on that customer's dashboard", async (t) => {
  const { call } = await harness(t);
  const mine = await call("/api/v1/account/register", { method: "POST", body: account });
  const theirs = await call("/api/v1/account/register", {
    method: "POST", body: { ...account, email: "other@example.com", name: "Other Person" }
  });

  const booking = {
    vehicle: "tata-ace", pickup: "Chennai depot",
    pickupDate: "2099-06-10", returnDate: "2099-06-11"
  };
  assert.equal((await call("/api/v1/bookings", {
    method: "POST", body: booking, cookie: mine.cookie
  })).status, 201);
  // An anonymous booking must not land on anyone's dashboard.
  assert.equal((await call("/api/v1/bookings", { method: "POST", body: booking })).status, 201);

  const ours = await call("/api/v1/account/bookings", { cookie: mine.cookie });
  assert.equal(ours.status, 200);
  assert.equal(ours.body.bookings.length, 1);
  assert.equal(ours.body.bookings[0].vehicle, "tata-ace");
  assert.equal(ours.body.bookings[0].stage, "upcoming");

  const other = await call("/api/v1/account/bookings", { cookie: theirs.cookie });
  assert.equal(other.body.bookings.length, 0, "another customer must not see these bookings");
});

test("account endpoints answer only their own method", async (t) => {
  const { call } = await harness(t);
  for (const [url, method] of [
    ["/api/v1/account/register", "GET"], ["/api/v1/account/login", "GET"],
    ["/api/v1/account/me", "POST"], ["/api/v1/account/bookings", "DELETE"]
  ]) {
    const response = await call(url, { method });
    assert.equal(response.status, 405, `${method} ${url}`);
    assert.ok(response.headers.get("allow"));
  }
});

test("a cross-site form post is refused", async (t) => {
  const { call } = await harness(t);
  const server = createApp({ dataDir: "/tmp" });
  const listener = server.listen(0, "127.0.0.1");
  await once(listener, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/v1/account/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify(account)
    });
    assert.equal(response.status, 403);
    await response.body?.cancel();
  } finally {
    await new Promise(resolve => listener.close(resolve));
  }
  assert.equal((await call("/api/v1/account/me")).status, 401);
});

test("the unversioned account path works too", async (t) => {
  const { call } = await harness(t);
  const created = await call("/api/account/register", { method: "POST", body: account });
  assert.equal(created.status, 201);
  assert.equal((await call("/api/account/me", { cookie: created.cookie })).status, 200);
});
