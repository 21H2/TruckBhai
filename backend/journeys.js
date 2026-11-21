"use strict";

const { validCoordinates } = require("../frontend/js/booking.js");

const bmlMunjal = {
  label: "BML Munjal University, 67th Milestone, NH 48, Kapriwas, Gurugram, Haryana 122413",
  city: "Gurugram",
  // Campus pin supplied for TruckBhai bookings.
  lat: 28.248900,
  lon: 76.813912
};
const campusNames = ["bml munjal university", "munjal university", "bmu"];

function serviceError(status, message) {
  return Object.assign(new Error(message), { status });
}

function parsePoint(value) {
  const parts = value?.split(",");
  if (parts?.length !== 2 || parts.some((part) => !part.trim())) return null;
  const [lat, lon] = parts.map(Number);
  const point = { lat, lon };
  return validCoordinates(point) ? point : null;
}

function photonPlace(feature) {
  const [lon, lat] = feature.geometry?.coordinates || [];
  if (!validCoordinates({ lat, lon })) return null;

  const { name, housenumber, street, district, city, county, state, postcode, country } = feature.properties || {};
  const address = [housenumber, street].filter(Boolean).join(" ");
  const parts = [name, address, district, city || county, state, postcode, country];
  const label = [...new Set(parts.filter((part) => typeof part === "string" && part.trim()).map((part) => part.trim()))]
    .join(", ").slice(0, 200).trim();
  return label.length >= 3 ? { label, lat, lon, ...(city ? { city } : {}) } : null;
}

function createJourneyService({
  fetcher = globalThis.fetch,
  photonUrl = process.env.PHOTON_URL || "https://photon.komoot.io/api/",
  osrmUrl = process.env.OSRM_URL
} = {}) {
  const demo = !osrmUrl && process.env.NODE_ENV !== "production";
  const routingBase = osrmUrl || (demo ? "https://router.project-osrm.org/" : null);
  let lastRoute;
  let lastDemoRequest = -Infinity;

  async function getJson(url, unavailableMessage, allowedCodes = []) {
    try {
      const response = await fetcher(url, {
        headers: { Accept: "application/json", "User-Agent": "TruckBhai/1.0" },
        signal: AbortSignal.timeout(7500)
      });
      const data = await response.json();
      if (response.ok || allowedCodes.includes(data?.code)) return data;
    } catch {
      // Both provider errors and timeouts are shown as temporarily unavailable.
    }
    throw serviceError(502, unavailableMessage);
  }

  return {
    async places(params) {
      const query = params.get("q")?.trim() || "";
      if (query.length < 3 || query.length > 200 || /[\x00-\x1f\x7f]/.test(query)) {
        throw serviceError(400, "Enter between 3 and 200 characters to search.");
      }

      const campusQuery = query.toLowerCase().replace(/\s+/g, " ");
      if (campusNames.some((name) => name.startsWith(campusQuery)) ||
          campusQuery.startsWith("bml munjal university ")) {
        return { places: [bmlMunjal] };
      }

      const url = new URL(photonUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("countrycode", "IN");
      url.searchParams.set("limit", "6");
      url.searchParams.set("lang", "en");
      const unavailable = "Location search is temporarily unavailable. You can enter the address manually.";
      const data = await getJson(url, unavailable);
      if (!Array.isArray(data?.features)) throw serviceError(502, unavailable);
      const places = new Map();
      for (const feature of data.features.slice(0, 6)) {
        if (!feature) continue;
        const place = photonPlace(feature);
        if (place && !places.has(place.label)) places.set(place.label, place);
      }
      return { places: [...places.values()] };
    },

    async route(params) {
      const pickup = parsePoint(params.get("pickup"));
      const dropoff = parsePoint(params.get("dropoff"));
      if (!pickup || !dropoff) throw serviceError(400, "Choose valid pickup and dropoff locations.");
      if (!routingBase) throw serviceError(503, "Road routing is temporarily unavailable.");

      const key = [pickup.lat, pickup.lon, dropoff.lat, dropoff.lon].join(",");
      if (lastRoute?.key === key && lastRoute.expires > Date.now()) return lastRoute.result;
      if (demo) {
        if (Date.now() - lastDemoRequest < 1000) throw serviceError(429, "Please wait a moment and try the route again.");
        lastDemoRequest = Date.now();
      }
      const coordinates = [pickup, dropoff].map(({ lat, lon }) => `${lon},${lat}`).join(";");
      const url = new URL(`route/v1/driving/${coordinates}`, routingBase.replace(/\/?$/, "/"));
      url.search = new URLSearchParams({ overview: "full", geometries: "geojson", generate_hints: "false" });
      const unavailable = "Road routing is temporarily unavailable.";
      const noRoute = ["NoRoute", "NoSegment"];
      const data = await getJson(url, unavailable, noRoute);
      if (noRoute.includes(data?.code)) throw serviceError(404, "No road route was found between these locations.");
      const route = data?.routes?.[0];
      const geometry = route?.geometry;
      const points = geometry?.coordinates;
      if (data?.code !== "Ok" || !Number.isFinite(route?.distance) || route.distance < 0 ||
          !Number.isFinite(route.duration) || route.duration < 0 ||
          geometry?.type !== "LineString" || !Array.isArray(points) || points.length < 2 ||
          points.some((point) => !Array.isArray(point) || !validCoordinates({ lat: point[1], lon: point[0] }))) {
        throw serviceError(502, unavailable);
      }

      const distanceKm = route.distance / 1000;
      const result = { distanceKm, durationMinutes: route.duration / 60, geometry };
      lastRoute = { key, result, expires: Date.now() + 60000 };
      return result;
    }
  };
}

module.exports = { createJourneyService };
