import * as bookings from "./booking.js";
import { connectBookingTrip } from "./booking-trip.js";
import * as forms from "./forms.js?v=esm";

export function initializePage(document, window) {
  var canvases = document.querySelectorAll(".canvas");
  var nav = document.querySelector(".nav");

  function fitCanvas() {
    canvases.forEach(function (canvas) {
      var page = canvas.querySelector(".page");
      if (!page || !page.offsetWidth) return;
      // Measure the CSS layout width before transforms, including the fluid mobile hero.
      var pageScale = Math.min(1, canvas.clientWidth / page.offsetWidth);
      page.style.transform = pageScale < 1 ? "scale(" + pageScale + ")" : "none";
      page.style.marginLeft = pageScale < 1 ? "0" : "auto";
      page.style.marginRight = pageScale < 1 ? "0" : "auto";
      canvas.style.height = page.offsetHeight * pageScale + "px";
    });
  }

  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", fitCanvas);
  window.addEventListener("load", fitCanvas);

  if (nav) {
    var menuButton = nav.querySelector(".nav-toggle");
    menuButton.addEventListener("click", function () {
      var open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
    });
    nav.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || menuButton.getAttribute("aria-expanded") !== "true") return;
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.focus();
    });
    document.addEventListener("click", function (event) {
      if (!nav.contains(event.target)) menuButton.setAttribute("aria-expanded", "false");
    });
  }

  var truckCards = Array.from(document.querySelectorAll(".truck-card[data-category]"));
  var cardSlots = truckCards.map(function (card) {
    return { left: card.style.left, top: card.style.top };
  });
  var filters = Array.from(document.querySelectorAll(".chip[data-filter], .tile[data-filter]"));
  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      filters.forEach(function (filter) {
        var active = filter === button;
        filter.classList.toggle("chip--active", active && !filter.dataset.field);
        filter.setAttribute("aria-pressed", String(active));
      });
      var slot = 0;
      truckCards.forEach(function (card) {
        card.hidden = button.dataset.filter !== "all" && card.dataset[button.dataset.field || "category"] !== button.dataset.filter;
        if (!card.hidden) {
          card.style.left = cardSlots[slot].left;
          card.style.top = cardSlots[slot].top;
          slot += 1;
        }
      });
      var status = document.getElementById("catalog-status");
      if (status) {
        var label = button.getAttribute("aria-label") || button.textContent.trim();
        status.textContent = slot ? label + " · " + slot + (slot === 1 ? " truck" : " trucks")
          : "No trucks listed for " + label + ". Choose Popular to see all trucks.";
        if (button.dataset.field) {
          status.focus({ preventScroll: true });
          document.querySelector(".chips").scrollIntoView({
            block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
          });
        }
      }
    });
  });

  function connectForm(form, validate, options) {
    var status = form.querySelector(".form-status");
    var submitButton = form.querySelector('[type="submit"]');
    var fields = Array.from(form.querySelectorAll("input, select, textarea"));
    var pending = false;
    var attempted = false;
    form.noValidate = true;

    function displayErrors(errors) {
      fields.forEach(function (field) {
        var errorId = field.id + "-error";
        var error = document.getElementById(errorId);
        if (error) {
          error.textContent = errors[field.name] || "";
          field.setAttribute("aria-describedby", errorId);
        }
        field.setAttribute("aria-invalid", errors[field.name] ? "true" : "false");
      });
    }

    function check() {
      if (options.update) options.update();
      var result = validate(Object.fromEntries(new window.FormData(form)));
      displayErrors(result.errors);
      return result;
    }

    function edit() {
      if (options.update) options.update();
      if (attempted) check();
      delete status.dataset.state;
      status.textContent = "";
    }
    form.addEventListener("input", edit);
    form.addEventListener("change", edit);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (pending) return;
      if (options.preview && !options.preview.canConfirm(event.submitter)) {
        delete status.dataset.state;
        status.textContent = "";
        options.preview.show();
        return;
      }
      attempted = true;
      var result = check();
      if (Object.keys(result.errors).length) {
        status.dataset.state = "error";
        status.textContent = "Check the form details above.";
        var firstInvalid = fields.find(function (field) { return result.errors[field.name]; });
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var clickedButton = event.submitter || submitButton;
      pending = true;
      submitButton.disabled = true;
      clickedButton.disabled = true;
      fields.forEach(function (field) { field.disabled = true; });
      status.dataset.state = "pending";
      status.textContent = "Saving…";
      var controller = new window.AbortController();
      var timeout = window.setTimeout(function () { controller.abort(); }, 15000);
      var serverInvalidField = null;
      try {
        var response = await window.fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result.values),
          signal: controller.signal
        });
        var data = await response.json();
        if (!response.ok) {
          if (data.errors) {
            displayErrors(data.errors);
            serverInvalidField = fields.find(function (field) { return data.errors[field.name]; });
          }
          throw new Error(data.message || "Could not save your submission. Please try again.");
        }
        form.reset();
        if (options.reset) options.reset();
        attempted = false;
        displayErrors({});
        if (options.update) options.update();
        status.dataset.state = "success";
        status.textContent = options.success + (options.showReference === false ? "" : " Reference: " + data.id);
        if (options.preview) status.focus();
      } catch (error) {
        status.dataset.state = "error";
        status.textContent = error.name === "AbortError"
          ? "The server did not respond in time. Your details are still here."
          : error instanceof TypeError || error instanceof SyntaxError
          ? "Could not reach the form service. Please try again."
          : error.message;
      } finally {
        window.clearTimeout(timeout);
        fields.forEach(function (field) { field.disabled = false; });
        submitButton.disabled = false;
        clickedButton.disabled = false;
        pending = false;
        if (serverInvalidField) serverInvalidField.focus();
      }
    });

    return { isPending: function () { return pending; } };
  }

  var contactForm = document.querySelector("#contact-form");
  if (contactForm) {
    connectForm(contactForm, forms.contact, { success: "Your message was saved." });
  }

  var newsletterForm = document.querySelector("#newsletter-form");
  if (newsletterForm) {
    connectForm(newsletterForm, forms.subscriber, { success: "Subscribed!", showReference: false });
  }

  var bookingForm = document.querySelector("#booking-form");
  if (!bookingForm) return;

  var trip = connectBookingTrip(bookingForm, bookings);
  var pickupDate = bookingForm.elements.pickupDate;
  var returnDate = bookingForm.elements.returnDate;

  var requestedVehicle = new URLSearchParams(window.location.search).get("vehicle");
  trip.selectVehicle(requestedVehicle);

  document.querySelectorAll(".truck-card .book").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      if (bookingController.isPending()) return;
      trip.selectVehicle(link.closest(".truck-card").dataset.vehicle);
      bookingForm.scrollIntoView({ block: "start" });
    });
  });

  function updateDates() {
    pickupDate.min = bookings.localDate();
    // A return on the following day is the earliest allowed rental end.
    var date = new Date((pickupDate.value || pickupDate.min) + "T00:00:00");
    if (!Number.isFinite(date.getTime())) date = new Date(pickupDate.min + "T00:00:00");
    date.setDate(date.getDate() + 1);
    returnDate.min = bookings.localDate(date);
  }

  updateDates();
  var bookingController = connectForm(bookingForm, function (input) {
    return bookings.validate(trip.bookingDetails(input));
  }, {
    update: updateDates,
    reset: trip.reset,
    preview: trip.preview,
    success: "Booking request saved."
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => initializePage(document, window));
}

// -------- for sir reference --------
/*The script in `main.js` initializes the website UI:

- Resizes canvas sections responsively.
- Handles the mobile navigation menu and Escape/outside clicks.
- Filters and rearranges truck cards.
- Validates and submits contact, newsletter, and booking forms.
- Displays success/error status messages and server response references.
- Preselects vehicles and updates valid pickup/return dates.*/
