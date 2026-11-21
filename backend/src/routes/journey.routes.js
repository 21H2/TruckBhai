import { Router } from "express";
import { createJourneyController } from "../controllers/journey.controller.js";
import { sendJson } from "../http.js";

export function createJourneyRoutes({ journeys, fuel }) {
  const { getFuelPrice, searchPlaces, getJourney } = createJourneyController({ journeys, fuel });
  const routes = {
    "/api/fuel": getFuelPrice,
    "/api/places": searchPlaces,
    "/api/journey": getJourney
  };
  const router = Router();

  router.use((request, response, next) => {
    const { pathname } = response.locals;
    if (!Object.hasOwn(routes, pathname)) return next();
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return sendJson(response, 405, { message: "Use GET to look up a location or route." });
    }
    return routes[pathname](response);
  });

  return router;
}
