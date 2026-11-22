import { test } from "node:test";
import assert from "node:assert/strict";
import { createMailer } from "../src/email.js";

const configured = {
  EMAILJS_SERVICE_ID: "service_test",
  EMAILJS_PUBLIC_KEY: "public_test",
  EMAILJS_PRIVATE_KEY: "private_test",
  EMAILJS_CONTACT_TEMPLATE_ID: "template_contact",
  EMAILJS_NEWSLETTER_TEMPLATE_ID: "template_news"
};

function recorder() {
  const sent = [];
  return {
    sent,
    request: async (url, options) => {
      sent.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 200, body: null };
    }
  };
}

test("a mailer is only created once the required keys are present", () => {
  assert.equal(createMailer({}, async () => {}), null);
  assert.equal(createMailer({ ...configured, EMAILJS_SERVICE_ID: "" }, async () => {}), null);
  assert.equal(createMailer({ ...configured, EMAILJS_CONTACT_TEMPLATE_ID: "" }, async () => {}), null);
  assert.ok(createMailer(configured, async () => {}));
});

test("a welcome email is sent only when its template is configured", async () => {
  const withoutTemplate = recorder();
  const quiet = createMailer(configured, withoutTemplate.request);
  await quiet.send("welcome", { email: "umesh@example.com", name: "Umesh" });
  assert.equal(withoutTemplate.sent.length, 0,
    "without EMAILJS_WELCOME_TEMPLATE_ID nothing should be sent");

  const withTemplate = recorder();
  const mailer = createMailer({ ...configured, EMAILJS_WELCOME_TEMPLATE_ID: "template_welcome" },
    withTemplate.request);
  await mailer.send("welcome", { email: "umesh@example.com", name: "Umesh", id: "abc" });

  assert.equal(withTemplate.sent.length, 1);
  const { url, body } = withTemplate.sent[0];
  assert.equal(url, "https://api.emailjs.com/api/v1.0/email/send");
  assert.equal(body.template_id, "template_welcome");
  assert.equal(body.service_id, "service_test");
  assert.deepEqual(body.template_params, { email: "umesh@example.com", name: "Umesh" });
});

test("contact mail still carries the name, message and reference", async () => {
  const { sent, request } = recorder();
  const mailer = createMailer(configured, request);
  await mailer.send("contact", {
    email: "someone@example.com", name: "Someone", message: "Hello there", _id: "ref-1"
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.template_id, "template_contact");
  assert.deepEqual(sent[0].body.template_params, {
    email: "someone@example.com", name: "Someone", message: "Hello there", reference_id: "ref-1"
  });
});

test("a subscription email carries only the address", async () => {
  const { sent, request } = recorder();
  const mailer = createMailer(configured, request);
  await mailer.send("subscription", { email: "news@example.com", id: "ref-2" });

  assert.equal(sent[0].body.template_id, "template_news");
  assert.deepEqual(sent[0].body.template_params, { email: "news@example.com" });
});

test("a failed send rejects without breaking later sends", async () => {
  let call = 0;
  const mailer = createMailer(configured, async () => {
    call++;
    return call === 1 ? { ok: false, status: 502, body: null } : { ok: true, status: 200, body: null };
  });

  await assert.rejects(mailer.send("contact", { email: "a@example.com" }), /HTTP 502/);
  // The queue must recover so the next submission still gets its email.
  await mailer.send("contact", { email: "b@example.com" });
  assert.equal(call, 2);
});
