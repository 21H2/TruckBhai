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
  const { createBooking, createContact, createSubscriber, trackBooking } = createSubmissionController(options);
  const bookings = createPostRouter(createBooking);
  // A customer tracks their own booking with the reference from the confirmation.
  bookings.get("/:reference", trackBooking);
  bookings.all("/:reference", (request, response) => {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { message: "Use GET to look up a booking." });
  });
  return {
    bookings,
    contacts: createPostRouter(createContact),
    subscribers: createPostRouter(createSubscriber)
  };
}
