import { vehicles } from "../../../frontend/js/booking.js";

const tataSource = "https://smalltrucks.tatamotors.com/blogs/tata-ace-gold-petrol-cx-partner-new-beginnings";

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

export async function seedVehicles(db) {
  await db.collection("vehicles").bulkWrite(fleet.map(record => ({
    updateOne: { filter: { _id: record._id }, update: { $setOnInsert: record }, upsert: true }
  })));
}

export function findVehicle(db, id) {
  return db ? db.collection("vehicles").findOne({ _id: id }) : fleet.find(record => record._id === id);
}

export async function listVehicles(db) {
  if (!db) return fleet;
  const ids = fleet.map(vehicle => vehicle._id);
  const records = await db.collection("vehicles")
    .find({ _id: { $in: ids } }, { projection: { name: 1, dailyRateInr: 1, fuelType: 1 } })
    .toArray();
  const byId = new Map(records.map(vehicle => [vehicle._id, vehicle]));
  return fleet.map(vehicle => ({ ...vehicle, ...byId.get(vehicle._id) }));
}

