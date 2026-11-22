// Customer account flows: register, sign in, sign out, and the dashboard that
// reads the signed-in customer's own bookings. Talks only to /api/v1/account/*,
// which gates everything on a server-held session cookie.
import { registration, credentials } from "./forms.js?v=esm";
import { vehicles } from "./booking.js";

const names = new Map(vehicles.map(({ id, name }) => [id, name]));
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const price = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
});

async function send(path, body) {
  const options = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
  const response = await fetch("/api/v1/account" + path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.message || "Something went wrong. Try again."), {
      status: response.status, errors: data.errors || {}
    });
  }
  return data;
}

function showErrors(form, errors) {
  for (const field of form.querySelectorAll("input")) {
    const holder = document.getElementById(field.id + "-error");
    if (!holder) continue;
    holder.textContent = errors[field.name] || "";
  }
}

// Shared submit handling for the signup and sign-in forms.
function connectAuthForm(form, { validate, path, redirect, pending, done }) {
  const status = form.querySelector(".form-status");
  const button = form.querySelector('[type="submit"]');
  form.noValidate = true;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    const { values, errors } = validate(input);
    showErrors(form, errors);
    if (Object.keys(errors).length) {
      status.textContent = "Check the highlighted fields.";
      status.dataset.state = "error";
      form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }

    button.disabled = true;
    status.textContent = pending;
    delete status.dataset.state;
    try {
      await send(path, values);
      status.textContent = done;
      status.dataset.state = "success";
      window.location.assign(redirect);
    } catch (error) {
      showErrors(form, error.errors);
      status.textContent = error.message;
      status.dataset.state = "error";
      const firstInvalid = Object.keys(error.errors)[0];
      (form.querySelector(`[name="${firstInvalid}"]`) || form.querySelector("input"))?.focus();
    } finally {
      button.disabled = false;
    }
  });
}

function bookingRow(booking) {
  const row = document.createElement("tr");
  const stageClass = booking.stage === "active" ? "confirmed"
    : booking.stage === "completed" ? "done" : "pending";
  const stageLabel = booking.stage === "active" ? "On rent"
    : booking.stage === "completed" ? "Completed" : "Upcoming";
  const day = (value) => {
    const parsed = Date.parse(value + "T00:00:00");
    return Number.isFinite(parsed) ? dateOnly.format(parsed) : value || "—";
  };

  const cells = [
    ["dash-ref", booking.id.slice(0, 8)],
    ["", names.get(booking.vehicle) || booking.vehicle],
    ["", booking.dropoff ? booking.pickup + " → " + booking.dropoff : booking.pickup],
    ["", day(booking.pickupDate) + " – " + day(booking.returnDate)],
    ["", Number.isFinite(booking.estimatedFareInr) ? price.format(booking.estimatedFareInr) : "—"]
  ];
  for (const [className, text] of cells) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text;
    row.append(cell);
  }
  const stageCell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = "dash-pill dash-pill--" + stageClass;
  pill.textContent = stageLabel;
  stageCell.append(pill);
  row.append(stageCell);
  return row;
}

async function connectDashboard() {
  const shell = document.getElementById("dash-shell");
  if (!shell) return;
  const status = document.getElementById("dash-status");

  let account;
  try {
    ({ account } = await send("/me"));
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("login.html?next=dashboard");
      return;
    }
    status.textContent = error.message;
    status.dataset.state = "error";
    return;
  }

  document.getElementById("dash-name").textContent = account.name;
  for (const [id, value] of [
    ["dash-account-name", account.name],
    ["dash-account-email", account.email],
    ["dash-account-phone", account.phone || "Not provided"]
  ]) {
    document.getElementById(id).textContent = value;
  }
  shell.hidden = false;

  const signOut = document.getElementById("dash-signout");
  signOut.addEventListener("click", async () => {
    signOut.disabled = true;
    try {
      await send("/logout", {});
      window.location.assign("login.html");
    } catch (error) {
      status.textContent = error.message;
      status.dataset.state = "error";
      signOut.disabled = false;
    }
  });

  try {
    const { bookings } = await send("/bookings");
    const body = document.getElementById("dash-rows");
    const empty = document.getElementById("dash-empty");
    const counts = { upcoming: 0, active: 0, completed: 0 };
    let spent = 0;
    for (const booking of bookings) {
      counts[booking.stage] = (counts[booking.stage] || 0) + 1;
      if (Number.isFinite(booking.estimatedFareInr)) spent += booking.estimatedFareInr;
    }
    document.getElementById("dash-active").textContent = String(counts.active);
    document.getElementById("dash-upcoming").textContent = String(counts.upcoming);
    document.getElementById("dash-completed").textContent = String(counts.completed);
    document.getElementById("dash-spent").textContent = price.format(spent);

    body.replaceChildren(...bookings.map(bookingRow));
    empty.hidden = bookings.length > 0;
    document.getElementById("dash-table").hidden = bookings.length === 0;
    status.textContent = "";
  } catch (error) {
    status.textContent = error.message;
    status.dataset.state = "error";
  }
}

const signupForm = document.getElementById("signup-form");
if (signupForm) {
  connectAuthForm(signupForm, {
    validate: registration,
    path: "/register",
    redirect: "dashboard.html",
    pending: "Creating your account…",
    done: "Account created. Opening your dashboard…"
  });
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  connectAuthForm(loginForm, {
    validate: credentials,
    path: "/login",
    redirect: "dashboard.html",
    pending: "Signing you in…",
    done: "Signed in. Opening your dashboard…"
  });
}

connectDashboard();
