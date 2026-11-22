import { Router } from "express";
import { createAdminController } from "../controllers/admin.controller.js";

export function createAdminRoutes(options) {
  const handleAdminRequest = createAdminController(options);
  const pages = Router();
  const api = Router();

  pages.use((request, response, next) => {
    const { pathname } = response.locals;
    if (pathname !== "/admin" && pathname !== "/admin/login") return next();
    return handleAdminRequest(request, response);
  });

  api.use((request, response, next) => {
    const apiPath = response.locals.pathname.slice(request.baseUrl.length);
    if (!apiPath.startsWith("/")) return next();
    return handleAdminRequest(request, response, apiPath);
  });

  return { pages, api };
}
