import { listVehicles } from "../models/vehicle.model.js";

const cardLayouts = {
  "tata-ace": { category: "small", imageStyle: "left:10px;top:37px;width:350px;height:237px", alt: "TATA Ace HT mini truck" },
  "eicher-19": { category: "large", imageStyle: "left:8px;top:8px;width:368px;height:260px", alt: "EICHER 19 truck" },
  "eicher-pro": { category: "medium", imageStyle: "left:21px;top:23px;width:339px;height:257px", alt: "EICHER pro truck" },
  container: { category: "large", imageStyle: "left:8px;top:12px;width:368px;height:260px", alt: "12 by 20 container truck" },
  trailer: { category: "large", imageStyle: "left:-11px;top:55px;width:395px;height:178px", alt: "12 by 32 trailer" },
  refrigerated: { category: "large", imageStyle: "left:-7px;top:18px;width:347px;height:240px", alt: "Refrigerated trailer" }
};

export function createVehicleModelsPage(db) {
  return async function renderVehicleModels(_request, response) {
    const vehicles = await listVehicles(db);
    const cards = vehicles.map(({ _id: id, name, dailyRateInr, fuelType }, index) => ({
      ...cardLayouts[id],
      id,
      name,
      dailyRateInr,
      fuelLabel: fuelType ? fuelType.charAt(0).toUpperCase() + fuelType.slice(1) : "",
      left: 113 + (index % 3) * 416,
      top: index < 3 ? 703.83 : 1273.83,
      odometer: index === 0 ? "4,000 km" : "4,000",
      seats: index === 0 ? 2 : 4
    }));
    response.set("Cache-Control", "no-cache");
    response.render("vehicle-models", { cards });
  };
}
