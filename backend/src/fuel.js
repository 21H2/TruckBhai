import { vehicles } from "../../frontend/js/booking.js";
const endpoint = "https://india-petroleum-api.vercel.app/v1/prices/latest";
const metros = ["Delhi", "Mumbai", "Chennai", "Kolkata"];
const tataSource = "https://smalltrucks.tatamotors.com/blogs/tata-ace-gold-petrol-cx-partner-new-beginnings";
const delhiFallback = { petrol: 102.12, diesel: 95.2, date: "2026-11-21" };
const dayMs = 24 * 60 * 60 * 1000;

// Daily rate and mileage per vehicle class. Everything except the Ace is a diesel
// truck, so its fare has to account for distance; a flat rate across a mini truck
// and a 32 ft trailer priced every class identically.
const specifications = {
  "tata-ace": { dailyRateInr: 1200, fuelType: "petrol", mileageKmPerLitre: 13.5 },
  "eicher-pro": { dailyRateInr: 2600, fuelType: "diesel", mileageKmPerLitre: 7.5 },
  "eicher-19": { dailyRateInr: 3800, fuelType: "diesel", mileageKmPerLitre: 4.5 },
  container: { dailyRateInr: 4200, fuelType: "diesel", mileageKmPerLitre: 4 },
  trailer: { dailyRateInr: 5200, fuelType: "diesel", mileageKmPerLitre: 3.2 },
  refrigerated: { dailyRateInr: 5800, fuelType: "diesel", mileageKmPerLitre: 3 }
};

const fleet = vehicles.map(({ id, name }) => ({
  _id: id, name,
  ...specifications[id],
  ...(id === "tata-ace"
    ? { mileageSource: tataSource, mileageBasis: "Ace Gold Petrol CX proxy, midpoint of 12–15 km/L" }
    : { mileageBasis: "Indicative laden mileage for this vehicle class" })
}));

async function seedVehicles(db) {
  await db.collection("vehicles").bulkWrite(fleet.map(record => ({
    updateOne: { filter: { _id: record._id }, update: { $setOnInsert: record }, upsert: true }
  })));
}

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
    const vehicle = db ? await db.collection("vehicles").findOne({ _id: id }) : fleet.find(v => v._id === id);
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
export { createFuelLookup, seedVehicles };
