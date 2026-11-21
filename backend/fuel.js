"use strict";

const { vehicles } = require("../frontend/js/booking.js");
const endpoint = "https://india-petroleum-api.vercel.app/v1/prices/latest";
const metros = ["Delhi", "Mumbai", "Chennai", "Kolkata"];
const tataSource = "https://smalltrucks.tatamotors.com/blogs/tata-ace-gold-petrol-cx-partner-new-beginnings";

const fleet = vehicles.map(({ id, name }) => ({
  _id: id, name, dailyRateInr: 1000,
  fuelType: id === "tata-ace" ? "petrol" : "electric",
  mileageKmPerLitre: id === "tata-ace" ? 13.5 : null,
  ...(id === "tata-ace" ? { mileageSource: tataSource, mileageBasis: "Ace Gold Petrol CX proxy, midpoint of 12–15 km/L" } : {})
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.date) || !Number.isFinite(data.petrol?.delhi) || data.petrol.delhi <= 0) throw Error();
      snapshot = data;
      nextCheck = Date.now() + 86400000;
    } catch {
      nextCheck = Date.now() + 60000;
    } finally {
      pending = null;
    }
  }

  return async function lookup(params) {
    const id = params.get("vehicle");
    const vehicle = db ? await db.collection("vehicles").findOne({ _id: id }) : fleet.find(v => v._id === id);
    if (params.get("pricing") === "1" && vehicle?.fuelType === "electric") {
      return { dailyRateInr: vehicle.dailyRateInr, fuelType: vehicle.fuelType };
    }
    if (Date.now() >= nextCheck) await (pending ||= refresh());
    if (!snapshot) throw Object.assign(Error("Fuel prices are temporarily unavailable."), { status: 503 });
    const city = (params.get("city") || "").trim().toLowerCase();
    const match = metros.find(name => name.toLowerCase() === (city === "new delhi" ? "delhi" : city));
    const rate = snapshot.petrol[match?.toLowerCase()];
    const useCity = Number.isFinite(rate) && rate > 0;
    return { city: useCity ? match : "Delhi", fallback: !useCity, pricePerLitre: useCity ? rate : snapshot.petrol.delhi,
      dailyRateInr: vehicle?.dailyRateInr, date: snapshot.date, fuelType: vehicle?.fuelType, mileageKmPerLitre: vehicle?.mileageKmPerLitre };
  };
}
module.exports = { createFuelLookup, seedVehicles };
