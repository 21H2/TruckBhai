document.addEventListener("DOMContentLoaded", function () {
  var canvas = document.querySelector(".canvas");
  var page = document.querySelector(".page");

  function fitCanvas() {
    if (!canvas || !page) return;
    var available = document.documentElement.clientWidth;
    var scale = Math.min(1, available / 1440);
    page.style.transform = scale < 1 ? "scale(" + scale + ")" : "none";
    page.style.marginLeft = scale < 1 ? "0" : "auto";
    page.style.marginRight = scale < 1 ? "0" : "auto";
    canvas.style.height = page.offsetHeight * scale + "px";
  }

  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", fitCanvas);
  window.addEventListener("load", fitCanvas);

  var truckCards = Array.from(document.querySelectorAll(".truck-card[data-category]"));
  var cardSlots = truckCards.map(function (card) {
    return { left: card.style.left, top: card.style.top };
  });
  var filters = Array.from(document.querySelectorAll(".chip[data-filter]"));
  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      filters.forEach(function (filter) {
        var active = filter === button;
        filter.classList.toggle("chip--active", active);
        filter.setAttribute("aria-pressed", String(active));
      });
      var slot = 0;
      truckCards.forEach(function (card) {
        card.hidden = button.dataset.filter !== "all" && card.dataset.category !== button.dataset.filter;
        if (!card.hidden) {
          card.style.left = cardSlots[slot].left;
          card.style.top = cardSlots[slot].top;
          slot += 1;
        }
      });
    });
  });

  document.querySelectorAll("form:not(#booking-form)").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      form.reset();
    });
  });

  var bookingForm = document.querySelector("#booking-form");
  if (!bookingForm) return;

  var bookings = window.TruckBhaiBookings;
  var vehicleSelect = bookingForm.elements.vehicle;
  var pickupDate = bookingForm.elements.pickupDate;
  var returnDate = bookingForm.elements.returnDate;
  var status = document.querySelector("#booking-status");
  var submitButton = bookingForm.querySelector('[type="submit"]');
  var pending = false;
  var attempted = false;
  bookingForm.noValidate = true;

  bookings.vehicles.forEach(function (vehicle) {
    var option = document.createElement("option");
    option.value = vehicle.id;
    option.textContent = vehicle.name;
    vehicleSelect.appendChild(option);
  });

  var requestedVehicle = new URLSearchParams(window.location.search).get("vehicle");
  if (bookings.vehicles.some(function (vehicle) { return vehicle.id === requestedVehicle; })) {
    vehicleSelect.value = requestedVehicle;
  }

  document.querySelectorAll(".truck-card .book").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      if (pending) return;
      vehicleSelect.value = link.closest(".truck-card").dataset.vehicle;
      vehicleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      status.textContent = "";
      bookingForm.scrollIntoView({ block: "center" });
    });
  });

  function updateDates() {
    pickupDate.min = bookings.localDate();
    // A return on the following day is the earliest allowed rental end.
    var date = new Date((pickupDate.value || pickupDate.min) + "T00:00:00");
    if (Number.isFinite(date.getTime())) {
      date.setDate(date.getDate() + 1);
      returnDate.min = bookings.localDate(date);
    }
  }

  function displayErrors(errors) {
    ["vehicle", "pickup", "pickupDate", "returnDate"].forEach(function (name) {
      var field = bookingForm.elements[name];
      var errorId = field.id + "-error";
      document.getElementById(errorId).textContent = errors[name] || "";
      field.setAttribute("aria-describedby", errorId);
      field.setAttribute("aria-invalid", errors[name] ? "true" : "false");
    });
  }

  function validateBooking() {
    var result = bookings.validate(Object.fromEntries(new FormData(bookingForm)));
    displayErrors(result.errors);
    return result;
  }

  updateDates();
  bookingForm.addEventListener("input", function () {
    updateDates();
    if (attempted) validateBooking();
    status.textContent = "";
  });
  bookingForm.addEventListener("change", function () {
    updateDates();
    if (attempted) validateBooking();
  });

  bookingForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (pending) return;
    attempted = true;
    updateDates();
    var result = validateBooking();
    if (Object.keys(result.errors).length) {
      status.textContent = "Check the booking details above.";
      status.dataset.state = "error";
      return;
    }

    pending = true;
    submitButton.disabled = true;
    // Keep the submitted values stable until the server finishes saving them.
    var fields = Array.from(bookingForm.querySelectorAll("input, select"));
    fields.forEach(function (field) { field.disabled = true; });
    status.dataset.state = "pending";
    status.textContent = "Saving your booking request…";
    try {
      var response = await fetch(bookingForm.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.values)
      });
      var data = await response.json();
      if (!response.ok) {
        if (data.errors) displayErrors(data.errors);
        throw new Error(data.message || "Could not save your booking. Please try again.");
      }
      bookingForm.reset();
      attempted = false;
      displayErrors({});
      updateDates();
      status.dataset.state = "success";
      status.textContent = "Booking request saved. Reference: " + data.id;
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = error instanceof TypeError || error instanceof SyntaxError
        ? "Could not reach the booking service. Please try again."
        : error.message;
    } finally {
      fields.forEach(function (field) { field.disabled = false; });
      submitButton.disabled = false;
      pending = false;
    }
  });
});
