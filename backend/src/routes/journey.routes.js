import { Router } from "express";
import { createJourneyController } from "../controllers/journey.controller.js";
import { sendJson } from "../http.js";

function createGetRouter(handler) {
  const router = Router({ strict: true });
  router.all("/", (request, response, next) => {
    if (response.locals.pathname !== request.baseUrl) return next();
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return sendJson(response, 405, { message: "Use GET to look up a location or route." });
    }
    return handler(response);
  });
  return router;
}

export function createJourneyRoutes({ journeys, fuel }) {
  const { getFuelPrice, searchPlaces, getJourney } = createJourneyController({ journeys, fuel });
  return {
    fuel: createGetRouter(getFuelPrice),
    places: createGetRouter(searchPlaces),
    journey: createGetRouter(getJourney)
  };
}
