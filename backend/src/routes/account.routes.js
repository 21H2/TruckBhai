import { Router } from "express";
import { createAccountController } from "../controllers/account.controller.js";
import { sendJson } from "../http.js";

function only(method, handler) {
  return (request, response) => {
    if (request.method !== method) {
      response.setHeader("Allow", method);
      return sendJson(response, 405, { message: `Use ${method} for this endpoint.` });
    }
    return handler(request, response);
  };
}

export function createAccountRoutes(options) {
  const controller = createAccountController(options);
  const router = Router({ strict: false });

  router.all("/register", only("POST", controller.register));
  router.all("/login", only("POST", controller.signIn));
  router.all("/logout", only("POST", controller.signOut));
  router.all("/reset-request", only("POST", controller.requestReset));
  router.all("/reset", only("POST", controller.completeReset));
  router.all("/me", only("GET", controller.currentAccount));
  router.all("/bookings", only("GET", controller.myBookings));

  return { router, sessionEmail: controller.sessionEmail };
}