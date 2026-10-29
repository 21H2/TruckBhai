"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const forms = require("../js/forms.js");
const source = fs.readFileSync(path.join(__dirname, "../js/main.js"), "utf8");

// A minimal DOM fixture tests event handlers and data retention without a browser.
// Full browser layout and native controls require a separate browser check.
function fixture(fetch, { newsletter = false, timeout } = {}) {
  const initial = newsletter
    ? { email: "asha@example.com" }
    : { name: "Asha Kumar", email: "asha@example.com", message: "Please send rental details." };
  let focusedField;
  const fields = Object.entries(initial).map(([name, value]) => ({
    name, value, id: (newsletter ? "newsletter-" : "contact-") + name, disabled: false,
    attributes: {}, setAttribute(key, next) { this.attributes[key] = next; },
    focus() { focusedField = name; }
  }));
  const errors = Object.fromEntries(fields.map((field) => [field.id + "-error", { textContent: "" }]));
  const status = { textContent: "", dataset: {} };
  const button = { disabled: false };
  const events = {};
  const form = {
    action: "http://127.0.0.1:3000/api/" + (newsletter ? "subscribers" : "contacts"),
    noValidate: false, resets: 0,
    querySelector: (selector) => selector === ".form-status" ? status : button,
    querySelectorAll: () => fields,
    addEventListener: (name, listener) => { events[name] = listener; },
    reset() { this.resets += 1; fields.forEach((field) => { field.value = ""; }); }
  };
  const document = {
    addEventListener: (name, listener) => { if (name === "DOMContentLoaded") listener(); },
    querySelector: (selector) => selector === (newsletter ? "#newsletter-form" : "#contact-form") ? form : null,
    querySelectorAll: () => [],
    getElementById: (id) => errors[id]
  };
  vm.runInNewContext(source, {
    document, fetch, AbortController,
    window: { TruckBhaiForms: forms, addEventListener() {} },
    setTimeout: timeout || setTimeout, clearTimeout,
    FormData: class {
      constructor() { this.entries = fields.filter((field) => !field.disabled).map((field) => [field.name, field.value]); }
      [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
    }
  });
  return {
    fields, form, status, button, errors,
    values: () => Object.fromEntries(fields.map((field) => [field.name, field.value])),
    focusedField: () => focusedField,
    submit: () => events.submit({ preventDefault() {} }),
    edit: () => events.input()
  };
}

test("invalid form values show field errors and never reach the server", async () => {
  let calls = 0;
  const page = fixture(async () => { calls += 1; });
  page.fields.find((field) => field.name === "email").value = "invalid";
  await page.submit();
  assert.equal(calls, 0);
  assert.ok(page.errors["contact-email-error"].textContent);
  assert.equal(page.status.dataset.state, "error");
  assert.equal(page.focusedField(), "email");
  assert.equal(page.form.resets, 0);
  page.fields.find((field) => field.name === "email").value = "asha@example.com";
  page.edit();
  assert.equal(page.errors["contact-email-error"].textContent, "");
  assert.equal(page.status.textContent, "");
  assert.equal(page.status.dataset.state, undefined);
});

test("repeated clicks send one request and successful saving alone clears the form", async () => {
  let calls = 0;
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const page = fixture(async (url, options) => {
    calls += 1;
    assert.equal(JSON.parse(options.body).email, "asha@example.com");
    return pending;
  });
  const first = page.submit();
  assert.equal(page.status.dataset.state, "pending");
  assert.ok(page.button.disabled && page.fields.every((field) => field.disabled));
  await page.submit();
  assert.equal(calls, 1);
  assert.equal(page.form.resets, 0);
  finish({ ok: true, json: async () => ({ id: "saved-reference" }) });
  await first;
  assert.equal(page.form.resets, 1);
  assert.equal(page.status.dataset.state, "success");
  assert.match(page.status.textContent, /saved-reference/);
  assert.ok(!page.button.disabled && page.fields.every((field) => !field.disabled));
});

test("server and network errors retain values and restore the submit button", async () => {
  for (const fail of [
    async () => ({ ok: false, json: async () => ({ message: "Storage unavailable." }) }),
    async () => { throw new Error("Network disconnected."); }
  ]) {
    const page = fixture(fail);
    const before = page.values();
    await page.submit();
    assert.deepEqual(page.values(), before);
    assert.equal(page.form.resets, 0);
    assert.equal(page.status.dataset.state, "error");
    assert.ok(!page.button.disabled && page.fields.every((field) => !field.disabled));
  }
});

test("duplicate newsletter responses retain the address and show its inline error", async () => {
  const message = "This email address is already subscribed.";
  const page = fixture(async () => ({
    ok: false, json: async () => ({ message, errors: { email: message } })
  }), { newsletter: true });
  await page.submit();
  assert.equal(page.values().email, "asha@example.com");
  assert.equal(page.errors["newsletter-email-error"].textContent, message);
  assert.equal(page.form.resets, 0);
  assert.equal(page.focusedField(), "email");
});

test("a timed-out request restores controls and keeps the submitted values", async () => {
  let triggerTimeout;
  const page = fixture((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
  }), { timeout: (callback, delay) => { assert.equal(delay, 15000); triggerTimeout = callback; } });
  const before = page.values();
  const saving = page.submit();
  triggerTimeout();
  await saving;
  assert.deepEqual(page.values(), before);
  assert.equal(page.status.dataset.state, "error");
  assert.match(page.status.textContent, /did not respond in time/);
  assert.ok(!page.button.disabled && page.fields.every((field) => !field.disabled));
});
