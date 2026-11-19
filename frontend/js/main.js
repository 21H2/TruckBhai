document.addEventListener("DOMContentLoaded", function () {
  var canvases = document.querySelectorAll(".canvas");
  var nav = document.querySelector(".nav");
  var heroTruck = document.querySelector(".home-hero .hero-truck");
  var navTrigger = heroTruck || document.querySelector("[data-nav-hero]");

  function updateNavigation() {
    if (!nav || !navTrigger) return;
    var bounds = navTrigger.getBoundingClientRect();
    var edge = heroTruck ? bounds.top : bounds.bottom;
    nav.classList.toggle("nav--scrolled", edge <= nav.getBoundingClientRect().bottom);
  }

  function fitCanvas() {
    if (!canvases.length) return;
    var available = document.documentElement.clientWidth;
    var scale = Math.min(1, available / 1440);
    canvases.forEach(function (canvas) {
      var page = canvas.querySelector(".page");
      var pageScale = canvas.classList.contains("home-hero") && available <= 640 ? 1 : scale;
      page.style.transform = pageScale < 1 ? "scale(" + pageScale + ")" : "none";
      page.style.marginLeft = pageScale < 1 ? "0" : "auto";
      page.style.marginRight = pageScale < 1 ? "0" : "auto";
      canvas.style.height = page.offsetHeight * pageScale + "px";
    });
    updateNavigation();
  }

  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", fitCanvas);
  window.addEventListener("load", fitCanvas);
  window.addEventListener("pageshow", updateNavigation);
  window.addEventListener("scroll", updateNavigation, { passive: true });

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
      var result = validate(Object.fromEntries(new FormData(form)));
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
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 15000);
      var serverInvalidField = null;
      try {
        var response = await fetch(form.action, {
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
        clearTimeout(timeout);
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
    connectForm(contactForm, window.TruckBhaiForms.contact, { success: "Your message was saved." });
  }

  var newsletterForm = document.querySelector("#newsletter-form");
  if (newsletterForm) {
    connectForm(newsletterForm, window.TruckBhaiForms.subscriber, { success: "Subscribed!", showReference: false });
  }

  var bookingForm = document.querySelector("#booking-form");
  if (!bookingForm) return;

  var bookings = window.TruckBhaiBookings;
  var trip = window.TruckBhaiTrip(bookingForm, bookings);
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
});
