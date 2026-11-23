import { findVehicle } from "./models/vehicle.model.js";

const endpoint = "https://india-petroleum-api.vercel.app/v1/prices/latest";
const metros = ["Delhi", "Mumbai", "Chennai", "Kolkata"];
const delhiFallback = { petrol: 102.12, diesel: 95.2, date: "2026-11-21" };
const dayMs = 24 * 60 * 60 * 1000;

function createFuelLookup(db, fetcher = fetch) {
  let snapshot;
  let nextCheck = 0;
  let pending;

  async function refresh() {
    try {
      const response = await fetcher(endpoint, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw Error();
      const { data } = await response.json();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.date) ||
          !Number.isFinite(data.petrol?.delhi) || data.petrol.delhi <= 0 ||
          !Number.isFinite(data.diesel?.delhi) || data.diesel.delhi <= 0) throw Error();
      snapshot = data;
      nextCheck = Date.now() + dayMs;
    } catch {
      snapshot = undefined;
      nextCheck = Date.now() + 60000;
    }
  }

  return async function lookup(params) {
    const id = params.get("vehicle");
    const vehicle = await findVehicle(db, id);
    if (params.get("pricing") === "1" && vehicle?.fuelType === "electric") {
      return { dailyRateInr: vehicle.dailyRateInr, fuelType: vehicle.fuelType };
    }
    if (Date.now() >= nextCheck) {
      await (pending ||= refresh().finally(() => { pending = null; }));
    }
    // Price the fuel the vehicle actually burns; a diesel truck costed at the
    // petrol rate would overstate every long trip.
    const fuelType = vehicle?.fuelType === "petrol" ? "petrol" : "diesel";
    const prices = snapshot?.[fuelType];
    const city = (params.get("city") || "").trim().toLowerCase();
    const match = metros.find(name => name.toLowerCase() === (city === "new delhi" ? "delhi" : city));
    const rate = prices?.[match?.toLowerCase()];
    const useCity = Number.isFinite(rate) && rate > 0;
    return {
      city: useCity ? match : "Delhi",
      fallback: !useCity,
      pricePerLitre: useCity ? rate : prices?.delhi ?? delhiFallback[fuelType],
      date: snapshot?.date ?? delhiFallback.date,
      dailyRateInr: vehicle?.dailyRateInr,
      fuelType: vehicle?.fuelType,
      mileageKmPerLitre: vehicle?.mileageKmPerLitre
    };
  };
}
export { createFuelLookup };
