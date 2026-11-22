// Booking tracking: looks up a reference through GET /api/v1/bookings/:reference
// and renders the stage the stored dates imply. No status is invented here; the
// server derives the stage and this file only presents it.
import { vehicles } from "./booking.js";

const form = document.getElementById("track-form");
if (form) {
  const field = document.getElementById("track-reference");
  const status = form.querySelector(".form-status");
  const button = form.querySelector('[type="submit"]');
  const result = document.getElementById("track-result");
  const names = new Map(vehicles.map(({ id, name }) => [id, name]));
  const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const price = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  });

  const stages = [
    { key: "received", label: "Request received", note: "We have your booking request." },
    { key: "upcoming", label: "Confirmed", note: "Your vehicle is reserved for the pickup date." },
    { key: "active", label: "On rent", note: "The vehicle is out on your trip." },
    { key: "completed", label: "Completed", note: "The rental period has ended." }
  ];

  function setStatus(message, state) {
    status.textContent = message;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  function day(value) {
    const parsed = Date.parse(value + "T00:00:00");
    return Number.isFinite(parsed) ? dateOnly.format(parsed) : value;
  }

  function detail(term, value) {
    const row = document.createElement("div");
    row.className = "dash-detail";
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }

  function render(booking) {
    const reached = stages.findIndex((stage) => stage.key === booking.stage);
    const timeline = document.createElement("ol");
    timeline.className = "track-timeline";
    stages.forEach((stage, index) => {
      const item = document.createElement("li");
      item.className = "track-step" + (index <= reached ? " track-step--done" : "");
      if (index === reached) item.classList.add("track-step--current");
      const label = document.createElement("p");
      label.className = "track-step-label";
      label.textContent = stage.label;
      const note = document.createElement("p");
      note.className = "track-step-note";
      note.textContent = index === 0 ? "Logged " + dateTime.format(Date.parse(booking.submittedAt)) : stage.note;
      item.append(label, note);
      timeline.append(item);
    });

    const heading = document.createElement("div");
    heading.className = "track-head";
    const route = document.createElement("h2");
    route.className = "track-route";
    route.textContent = booking.pickup + " → " + booking.dropoff;
    const pill = document.createElement("span");
    pill.className = "dash-pill dash-pill--" +
      (booking.stage === "active" ? "confirmed" : booking.stage === "completed" ? "done" : "pending");
    pill.textContent = stages[reached]?.label || "Received";
    heading.append(route, pill);

    const list = document.createElement("dl");
    list.append(
      detail("Reference", booking.id),
      detail("Vehicle", names.get(booking.vehicle) || booking.vehicle),
      detail("Pickup date", day(booking.pickupDate)),
      detail("Return date", day(booking.returnDate))
    );
    if (Number.isFinite(booking.estimatedFareInr)) {
      list.append(detail("Estimated fare", price.format(booking.estimatedFareInr)));
    }

    result.replaceChildren(heading, timeline, list);
    result.hidden = false;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reference = field.value.trim();
    if (!reference) {
      setStatus("Enter the booking reference from your confirmation.", "error");
      field.focus();
      return;
    }
    button.disabled = true;
    result.hidden = true;
    setStatus("Looking up your booking…");
    try {
      const response = await fetch("/api/v1/bookings/" + encodeURIComponent(reference));
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not look up that booking.");
      setStatus("");
      render(data.booking);
      result.focus({ preventScroll: true });
    } catch (error) {
      setStatus(error.message || "Could not look up that booking. Try again.", "error");
      field.focus();
    } finally {
      button.disabled = false;
    }
  });
}
