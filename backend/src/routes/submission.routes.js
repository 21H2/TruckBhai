import { Router } from "express";
import { createSubmissionController } from "../controllers/submission.controller.js";
import { sendJson } from "../http.js";

export function createSubmissionRoutes(options) {
  const { createBooking, createContact, createSubscriber } = createSubmissionController(options);
  const routes = {
    "/api/bookings": createBooking,
    "/api/contacts": createContact,
    "/api/subscribers": createSubscriber
  };
  const router = Router();

  router.use((request, response, next) => {
    const { pathname } = response.locals;
    if (!Object.hasOwn(routes, pathname)) return next();
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { message: "Use POST to submit this form." });
    }
    return routes[pathname](request, response);
  });

  return router;
}
