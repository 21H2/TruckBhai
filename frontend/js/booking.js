(function (root, factory) {
  var bookings = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = bookings;
  } else {
    root.TruckBhaiBookings = bookings;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var vehicles = [
    { id: "tata-ace", name: "TATA Ace HT mini" },
    { id: "eicher-19", name: "EICHER 19" },
    { id: "eicher-pro", name: "EICHER pro" },
    { id: "container", name: "Container 12×20" },
    { id: "trailer", name: "Trailer 12×32" },
    { id: "refrigerated", name: "Refrigerated trailer" }
  ];

  function estimateFare(vehicle, distanceKm, pickupDate, returnDate) {
    if (!vehicle || !isDate(pickupDate) || !isDate(returnDate)) return null;
    const days = (Date.parse(returnDate) - Date.parse(pickupDate)) / 86400000;
    if (days < 1 || !Number.isFinite(vehicle.dailyRateInr) || vehicle.dailyRateInr <= 0) return null;
    let fuelCost = 0;
    if (vehicle.fuelType !== "electric") {
      if (vehicle.fuelType !== "petrol" || !Number.isFinite(distanceKm) || distanceKm < 0 ||
          !Number.isFinite(vehicle.mileageKmPerLitre) || vehicle.mileageKmPerLitre <= 0 ||
          !Number.isFinite(vehicle.pricePerLitre) || vehicle.pricePerLitre <= 0) return null;
      fuelCost = distanceKm / vehicle.mileageKmPerLitre * vehicle.pricePerLitre;
    }
    return Math.round(days * vehicle.dailyRateInr + fuelCost);
  }

  function localDate(date) {
    date = date || new Date();
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
      "-" + String(date.getDate()).padStart(2, "0");
  }

  function isDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validCoordinates(point) {
    return Boolean(point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
      Number.isFinite(point.lon) && Math.abs(point.lon) <= 180);
  }

  function validateLocation(input, values, errors, key) {
    var location = typeof input[key] === "string" ? input[key].trim() : "";
    values[key] = location;
    if (location.length < 3 || location.length > 200 || /[\x00-\x1f\x7f]/.test(location)) {
      errors[key] = "Enter a " + key + " location between 3 and 200 characters.";
    }
    var coordinatesKey = key + "Coordinates";
    if (Object.hasOwn(input, coordinatesKey)) {
      var point = input[coordinatesKey];
      if (validCoordinates(point)) {
        values[coordinatesKey] = { lat: point.lat, lon: point.lon };
      } else if (!errors[key]) {
        errors[key] = "Choose a valid " + key + " location.";
      }
    }
  }

  function validate(input, today) {
    input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    var values = {};
    var errors = {};
    ["vehicle", "pickupDate", "returnDate"].forEach(function (key) {
      values[key] = typeof input[key] === "string" ? input[key].trim() : "";
    });

    if (!vehicles.some(function (vehicle) { return vehicle.id === values.vehicle; })) {
      errors.vehicle = "Select a vehicle from the list.";
    }
    validateLocation(input, values, errors, "pickup");
    // Older API clients can still submit the original pickup-only booking format.
    if (Object.hasOwn(input, "dropoff") || Object.hasOwn(input, "pickupCoordinates") || Object.hasOwn(input, "dropoffCoordinates")) {
      validateLocation(input, values, errors, "dropoff");
      if (typeof input.pickupCity === "string") values.pickupCity = input.pickupCity.trim().slice(0, 100);
    }
    if (!isDate(values.pickupDate)) {
      errors.pickupDate = "Choose a valid pickup date.";
    } else if (values.pickupDate < (today || localDate())) {
      errors.pickupDate = "Pickup date cannot be in the past.";
    }
    if (!isDate(values.returnDate)) {
      errors.returnDate = "Choose a valid return date.";
    } else if (isDate(values.pickupDate) && values.returnDate <= values.pickupDate) {
      errors.returnDate = "Return date must be after the pickup date.";
    }
    return { values: values, errors: errors };
  }

  return {
    vehicles: vehicles, localDate: localDate, validate: validate, validCoordinates: validCoordinates,
    estimateFare: estimateFare
  };
});
