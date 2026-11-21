import { Router } from "express";
import { createAdminController } from "../controllers/admin.controller.js";

export function createAdminRoutes(options) {
  const router = Router();
  const handleAdminRequest = createAdminController(options);

  router.use((request, response, next) => {
    const { pathname } = response.locals;
    if (pathname !== "/admin" && pathname !== "/admin/login" && !pathname.startsWith("/api/admin/")) {
      return next();
    }

    return handleAdminRequest(request, response);
  });

  return router;
}
