import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../src/app.js";

const account = {
  name: "Umesh Sharma", email: "umesh@example.com", password: "correct horse 9"
};

// Captures the reset link the mailer would have delivered, which is the only
// place the raw token is ever exposed.
function captureMailer() {
  const sent = [];
  return {
    sent,
    mailer: { send: async (kind, record) => { sent.push({ kind, record }); } }
  };
}

async function harness(t, { mailer } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "truckbhai-reset-"));
  const app = createApp({ dataDir, mailer });
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
  return { call, dataDir };
}

test("a reset request answers the same whether or not the account exists", async (t) => {
  const { mailer, sent } = captureMailer();
  const { call } = await harness(t, { mailer });
  await call("/api/v1/account/register", { method: "POST", body: account });

  const known = await call("/api/v1/account/reset-request", {
    method: "POST", body: { email: account.email }
  });
  const unknown = await call("/api/v1/account/reset-request", {
    method: "POST", body: { email: "nobody@example.com" }
  });

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(known.body.message, unknown.body.message);
  // Only the real account gets an email, which is what keeps the replies identical
  // without actually mailing strangers.
  assert.equal(sent.filter(item => item.kind === "reset").length, 1);
});

test("a reset link sets a new password, works once, and ends old sessions", async (t) => {
  const { mailer, sent } = captureMailer();
  const { call } = await harness(t, { mailer });
  const created = await call("/api/v1/account/register", { method: "POST", body: account });
  assert.equal((await call("/api/v1/account/me", { cookie: created.cookie })).status, 200);

  await call("/api/v1/account/reset-request", { method: "POST", body: { email: account.email } });
  const { resetToken, resetLink } = sent.find(item => item.kind === "reset").record;
  assert.match(resetToken, /^[0-9a-f]{64}$/);
  assert.ok(resetLink.includes("forgot-password.html?token=" + resetToken));

  const updated = await call("/api/v1/account/reset", {
    method: "POST", body: { token: resetToken, password: "a brand new one" }
  });
  assert.equal(updated.status, 200);

  // The session that existed before the reset must no longer work.
  assert.equal((await call("/api/v1/account/me", { cookie: created.cookie })).status, 401);

  // The old password is dead and the new one works.
  assert.equal((await call("/api/v1/account/login", {
    method: "POST", body: { email: account.email, password: account.password }
  })).status, 401);
  assert.equal((await call("/api/v1/account/login", {
    method: "POST", body: { email: account.email, password: "a brand new one" }
  })).status, 200);

  // Single use.
  const reused = await call("/api/v1/account/reset", {
    method: "POST", body: { token: resetToken, password: "yet another one" }
  });
  assert.equal(reused.status, 400);
  assert.match(reused.body.message, /expired|no longer valid/i);
});

test("a forged or malformed reset token is refused", async (t) => {
  const { mailer } = captureMailer();
  const { call } = await harness(t, { mailer });
  await call("/api/v1/account/register", { method: "POST", body: account });

  for (const token of ["", "abc", "z".repeat(64), "a".repeat(64), "../../users.json"]) {
    const response = await call("/api/v1/account/reset", {
      method: "POST", body: { token, password: "a brand new one" }
    });
    assert.equal(response.status, 400, JSON.stringify(token));
  }
  // The original password still works, so nothing was changed.
  assert.equal((await call("/api/v1/account/login", {
    method: "POST", body: { email: account.email, password: account.password }
  })).status, 200);
});

test("a reset refuses a password that is too short", async (t) => {
  const { mailer, sent } = captureMailer();
  const { call } = await harness(t, { mailer });
  await call("/api/v1/account/register", { method: "POST", body: account });
  await call("/api/v1/account/reset-request", { method: "POST", body: { email: account.email } });
  const { resetToken } = sent.find(item => item.kind === "reset").record;

  const short = await call("/api/v1/account/reset", {
    method: "POST", body: { token: resetToken, password: "short" }
  });
  assert.equal(short.status, 422);
  assert.ok(short.body.errors.password);

  // The token survives a rejected attempt so the customer can retry.
  assert.equal((await call("/api/v1/account/reset", {
    method: "POST", body: { token: resetToken, password: "long enough now" }
  })).status, 200);
});

test("reset requests are rate limited per email", async (t) => {
  const { mailer } = captureMailer();
  const { call } = await harness(t, { mailer });
  await call("/api/v1/account/register", { method: "POST", body: account });

  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    last = await call("/api/v1/account/reset-request", {
      method: "POST", body: { email: account.email }
    });
  }
  assert.equal(last.status, 429);
});

test("the reset endpoints answer only POST", async (t) => {
  const { call } = await harness(t);
  for (const url of ["/api/v1/account/reset-request", "/api/v1/account/reset"]) {
    const response = await call(url, { method: "GET" });
    assert.equal(response.status, 405, url);
    assert.equal(response.headers.get("allow"), "POST");
  }
});

test("a reset works with no mailer configured, it just cannot be delivered", async (t) => {
  const { call } = await harness(t);
  await call("/api/v1/account/register", { method: "POST", body: account });
  const response = await call("/api/v1/account/reset-request", {
    method: "POST", body: { email: account.email }
  });
  // The request still succeeds so the response cannot leak mail configuration.
  assert.equal(response.status, 200);
});
