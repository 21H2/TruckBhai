import { Router } from "express";
import { createSubmissionController } from "../controllers/submission.controller.js";
import { sendJson } from "../http.js";

function createPostRouter(handler) {
  const router = Router({ strict: true });
  router.all("/", (request, response, next) => {
    if (response.locals.pathname !== request.baseUrl) return next();
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { message: "Use POST to submit this form." });
    }
    return handler(request, response);
  });
  return router;
}

export function createSubmissionRoutes(options) {
  const { createBooking, createContact, createSubscriber } = createSubmissionController(options);
  return {
    bookings: createPostRouter(createBooking),
    contacts: createPostRouter(createContact),
    subscribers: createPostRouter(createSubscriber)
  };
}
