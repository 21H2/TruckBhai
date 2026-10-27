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

  function validate(input, today) {
    input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    var values = {};
    var errors = {};
    ["vehicle", "pickup", "pickupDate", "returnDate"].forEach(function (key) {
      values[key] = typeof input[key] === "string" ? input[key].trim() : "";
    });

    if (!vehicles.some(function (vehicle) { return vehicle.id === values.vehicle; })) {
      errors.vehicle = "Select a vehicle from the list.";
    }
    if (values.pickup.length < 3 || values.pickup.length > 200 || /[\x00-\x1f\x7f]/.test(values.pickup)) {
      errors.pickup = "Enter a pickup location between 3 and 200 characters.";
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

  return { vehicles: vehicles, localDate: localDate, validate: validate };
});
