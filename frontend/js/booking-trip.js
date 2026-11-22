import { exampleRoute } from "./booking-example.js";

function connectAutocomplete(input, { search, delay = 0, minimum = 0, empty, loading }) {
  const panel = document.createElement("div");
  const list = document.createElement("ul");
  const status = document.createElement("p");
  panel.className = "booking-options";
  panel.id = input.id + "-options";
  panel.hidden = true;
  list.id = input.id + "-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-labelledby", input.id + "-label");
  input.labels[0].id = input.id + "-label";
  status.setAttribute("role", "status");
  panel.append(list, status);
  input.parentElement.append(panel);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");

  let selected = null;
  let suggestions = [];
  let activeIndex = -1;
  let timer;
  let request;

  function cancelSearch() {
    clearTimeout(timer);
    request?.abort();
    request = null;
  }

  function show(options, message = "") {
    suggestions = options;
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    input.setAttribute("aria-expanded", String(options.length > 0));
    list.replaceChildren(...options.map((option, index) => {
      const item = document.createElement("li");
      item.id = list.id + "-" + index;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.textContent = option.label;
      item.addEventListener("mousedown", (event) => event.preventDefault());
      item.addEventListener("click", () => select(option));
      return item;
    }));
    list.hidden = !options.length;
    status.textContent = message;
    status.hidden = !message;
    panel.hidden = !options.length && !message;
  }

  function open() {
    cancelSearch();
    show([]);
    const query = input.value.trim();
    if (query.length < minimum || input.disabled) return;
    timer = setTimeout(async () => {
      const controller = new AbortController();
      request = controller;
      if (loading) show([], loading);
      try {
        const options = await search(query, controller.signal);
        if (!controller.signal.aborted) show(options, options.length ? "" : empty);
      } catch (error) {
        if (!controller.signal.aborted) show([], error.message);
      }
    }, delay);
  }

  function select(option) {
    if (input.disabled) return;
    cancelSearch();
    show([]);
    selected = option;
    input.value = option.label;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  input.addEventListener("input", (event) => {
    if (selected && input.value !== selected.label) selected = null;
    if (!event.isComposing) open();
  });
  input.addEventListener("compositionend", open);
  input.addEventListener("focus", () => { if (!selected) open(); });
  input.addEventListener("blur", () => {
    cancelSearch();
    show([]);
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      cancelSearch();
      show([]);
    } else if (event.key === "Enter" && !panel.hidden) {
      event.preventDefault();
      if (suggestions.length) select(suggestions[Math.max(activeIndex, 0)]);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestions.length) {
        if (panel.hidden) open();
        return;
      }
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const index = activeIndex < 0 && step < 0 ? suggestions.length - 1 : activeIndex + step;
      activeIndex = Math.max(0, Math.min(index, suggestions.length - 1));
      const active = list.children[activeIndex];
      for (const item of list.children) item.setAttribute("aria-selected", String(item === active));
      input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }
  });

  return {
    value: () => selected,
    select,
    reset() {
      selected = null;
      cancelSearch();
      show([]);
    }
  };
}

async function readJson(path, params, signal, unavailable) {
  try {
    const response = await fetch(path + "?" + new URLSearchParams(params), { signal });
    const data = await response.json();
    if (response.ok) return data;
    throw Object.assign(new Error(data.message || unavailable), { status: response.status });
  } catch (error) {
    if (error.status || signal.aborted) throw error;
    throw new Error(unavailable);
  }
}

export function connectBookingTrip(form, bookings) {
  const vehicleOptions = bookings.vehicles.map(({ id, name }) => ({ id, label: name }));
  const vehicle = connectAutocomplete(form.elements.vehicle, {
    empty: "No matching vehicles.",
    search: (query) => vehicleOptions.filter(({ id, label }) =>
      label.toLowerCase().includes(query.toLowerCase()) || id.includes(query.toLowerCase()))
  });
  const locationSearch = {
    delay: 450,
    minimum: 3,
    loading: "Searching for locations…",
    empty: "No matching locations. Try another search or enter the address manually.",
    search: async (q, signal) => {
      const data = await readJson("/api/v1/places", { q }, signal,
        "Location search is unavailable. You can enter the address manually.");
      return data.places;
    }
  };
  const pickup = connectAutocomplete(form.elements.pickup, locationSearch);
  const dropoff = connectAutocomplete(form.elements.dropoff, locationSearch);
  const previewButton = document.getElementById("booking-preview");
  const confirmButton = document.getElementById("booking-confirm");
  const journey = document.getElementById("booking-journey");
  const summary = document.getElementById("journey-summary");
  const progress = document.getElementById("journey-progress");
  const distance = document.getElementById("journey-distance");
  const duration = document.getElementById("journey-duration");
  const mapElement = document.getElementById("journey-map");
  const mapStatus = document.getElementById("journey-map-status");
  const example = exampleRoute;
  const price = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  });
  const distanceFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

  let map;
  let routeLayers;
  let routeRequest;
  let reviewedStops;

  function drawMap(start, end, geometry) {
    if (!map) return;
    map.invalidateSize({ pan: false });
    routeLayers.clearLayers();
    if (geometry) {
      window.L.geoJSON(geometry, { style: { color: "#245a89", weight: 5, opacity: 0.9 } }).addTo(routeLayers);
    }
    const stops = [
      { place: start, label: "Pickup", color: "#237250" },
      { place: end, label: "Dropoff", color: "#914519" }
    ];
    for (const { place, label, color } of stops) {
      if (!place) continue;
      window.L.circleMarker([place.lat, place.lon], {
        radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1
      }).bindTooltip(label).addTo(routeLayers);
    }
    const bounds = routeLayers.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14, animate: false });
    } else {
      map.setView([22, 79], 5, { animate: false });
    }
  }

  function showMapProblem(message) {
    mapStatus.textContent = message;
    mapStatus.hidden = !message;
  }

  function startMap() {
    if (map) return;
    if (!window.L) {
      showMapProblem("The map could not be loaded.");
      return;
    }
    map = window.L.map(mapElement, { scrollWheelZoom: false });
    routeLayers = window.L.featureGroup().addTo(map);
    const tiles = window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://project-osrm.org/">OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap">Report map issue</a>'
    });
    tiles.on("tileload", () => showMapProblem(""));
    tiles.on("load", () => {
      if (!mapElement.querySelector(".leaflet-tile-loaded")) showMapProblem("Street map tiles are unavailable.");
    });
    tiles.addTo(map);
  }

  function hideJourney() {
    fuelRequest?.abort();
    routeRequest?.abort();
    routeRequest = null;
    reviewedStops = null;
    summary.hidden = true;
    progress.hidden = true;
    journey.hidden = true;
    previewButton.setAttribute("aria-expanded", "false");
  }

  let fuelRequest;
  async function showFare(city, distanceKm, isExample) {
    fuelRequest?.abort();
    const controller = new AbortController();
    fuelRequest = controller;
    const output = document.getElementById("journey-fare");
    output.textContent = "Calculating…";
    if (isExample) {
      output.textContent = "Unavailable · example route";
      return;
    }
    try {
      const data = await readJson("/api/v1/fuel", { city, vehicle: vehicle.value()?.id || "", pricing: "1" },
        controller.signal, "Fuel prices are temporarily unavailable.");
      if (controller.signal.aborted) return;
      const total = bookings.estimateFare(data, distanceKm, form.elements.pickupDate.value, form.elements.returnDate.value);
      output.textContent = total === null ? "Select a vehicle and rental dates" : price.format(total);

    } catch (error) {
      if (!controller.signal.aborted) output.textContent = error.message;
    }
  }

  function showEstimate(result, start, end, isExample = false) {
    showFare(start.city || start.label.split(",")[0], result.distanceKm, isExample);
    drawMap(start, end, result.geometry);
    distance.textContent = distanceFormat.format(result.distanceKm) + " km";
    const minutes = Math.round(result.durationMinutes);
    const hours = Math.floor(minutes / 60);
    duration.textContent = hours ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
    reviewedStops = isExample ? null : { pickup: start, dropoff: end };
    progress.hidden = true;
    summary.hidden = false;
  }

  function showExample() {
    showEstimate(example, example.pickup, example.dropoff, true);
  }

  async function resolveStop(key, selection, signal) {
    const query = form.elements[key].value.trim();
    if (selection?.label === query) return selection;
    if (query.length < locationSearch.minimum) return null;
    const places = await locationSearch.search(query, signal);
    return places[0] || null;
  }

  async function previewJourney() {
    if (routeRequest) return;
    reviewedStops = null;
    journey.hidden = false;
    summary.hidden = true;
    progress.hidden = false;
    previewButton.setAttribute("aria-expanded", "true");
    startMap();
    drawMap(pickup.value(), dropoff.value());
    journey.scrollIntoView({ block: "start" });
    mapElement.focus({ preventScroll: true });

    if (["pickup", "dropoff"].some((key) => form.elements[key].value.trim().length < locationSearch.minimum)) {
      showExample();
      return;
    }

    const controller = new AbortController();
    routeRequest = controller;
    const { signal } = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const [start, end] = await Promise.all([
        resolveStop("pickup", pickup.value(), signal),
        resolveStop("dropoff", dropoff.value(), signal)
      ]);
      if (signal.aborted) throw signal.reason;
      if (!start || !end || (start.lat === end.lat && start.lon === end.lon)) {
        showExample();
        return;
      }
      const result = await readJson("/api/v1/journey", {
        pickup: `${start.lat},${start.lon}`,
        dropoff: `${end.lat},${end.lon}`
      }, signal, "Road routing is temporarily unavailable.");
      if (signal.aborted) throw signal.reason;
      showEstimate(result, start, end);
    } catch {
      controller.abort();
      if (routeRequest === controller) showExample();
    } finally {
      clearTimeout(timeout);
      if (routeRequest === controller) routeRequest = null;
    }
  }

  function locationEdited(event) {
    if (!journey.hidden && (event.target === form.elements.pickup || event.target === form.elements.dropoff || event.target === form.elements.vehicle ||
        event.target === form.elements.pickupDate || event.target === form.elements.returnDate)) {
      hideJourney();
    }
  }
  form.addEventListener("input", locationEdited);
  form.addEventListener("change", locationEdited);

  return {
    preview: {
      show: previewJourney,
      canConfirm: (button) => button === confirmButton && !journey.hidden && !summary.hidden
    },
    selectVehicle(id) {
      const option = vehicleOptions.find((item) => item.id === id);
      if (option) vehicle.select(option);
    },
    bookingDetails(input) {
      input.pickupCity = reviewedStops?.pickup.city || reviewedStops?.pickup.label.split(",")[0] || "";
      input.vehicle = vehicle.value()?.id || "";
      for (const [key, location] of [["pickup", pickup], ["dropoff", dropoff]]) {
        const selected = location.value();
        const place = reviewedStops?.[key] || (selected?.label === input[key] ? selected : null);
        if (place) input[key + "Coordinates"] = { lat: place.lat, lon: place.lon };
      }
      return input;
    },
    reset() {
      vehicle.reset();
      pickup.reset();
      dropoff.reset();
      hideJourney();
    }
  };
}
