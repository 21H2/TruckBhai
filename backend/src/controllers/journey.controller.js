import { sendJson } from "../http.js";

export function createJourneyController({ journeys, fuel }) {
  const lookup = handler => async response => {
    return sendJson(response, 200, await handler(response.locals.searchParams));
  };

  return {
    getFuelPrice: lookup(fuel),
    searchPlaces: lookup(journeys.places),
    getJourney: lookup(journeys.route)
  };
}
