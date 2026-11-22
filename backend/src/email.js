import { setTimeout as delay } from "node:timers/promises";

function createMailer(env = process.env, request = fetch) {
  const serviceId = env.EMAILJS_SERVICE_ID?.trim();
  const publicKey = env.EMAILJS_PUBLIC_KEY?.trim();
  const privateKey = env.EMAILJS_PRIVATE_KEY?.trim();
  const templates = {
    contact: env.EMAILJS_CONTACT_TEMPLATE_ID?.trim(),
    subscription: env.EMAILJS_NEWSLETTER_TEMPLATE_ID?.trim()
  };
  if (!serviceId || !publicKey || !templates.contact || !templates.subscription) return null;

  let queue = Promise.resolve();
  let nextSendAt = 0;
  return {
    send(kind, record) {
      const delivery = queue.then(async () => {
        const wait = nextSendAt - Date.now();
        if (wait > 0) await delay(wait);
        nextSendAt = Date.now() + 1050;

        const params = { email: record.email };
        if (kind === "contact") {
          params.name = record.name;
          params.message = record.message;
          params.reference_id = record.id;
        }
        const response = await request("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            service_id: serviceId,
            template_id: templates[kind],
            user_id: publicKey,
            accessToken: privateKey || undefined,
            template_params: params
          })
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`EmailJS returned HTTP ${response.status}`);
      });
      queue = delivery.catch(() => {});
      return delivery;
    }
  };
}

export { createMailer };
