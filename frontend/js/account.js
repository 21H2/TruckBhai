// Customer account flows: register, sign in, sign out, and the dashboard that
// reads the signed-in customer's own bookings. Talks only to /api/v1/account/*,
// which gates everything on a server-held session cookie.
import { registration, credentials } from "./forms.js?v=esm";
import { vehicles } from "./booking.js";
import { nextTrip, renderNextTrip, monthlySpend, renderSpend } from "./dashboard-extras.js?v=1";

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
      // Honour ?next= so a visitor bounced off a page returns to it, but only for
      // a same-site page so the parameter cannot become an open redirect.
      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = next && /^[a-z0-9-]+\.html$/.test(next) ? next : null;
      window.location.assign(safeNext || redirect);
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
      window.location.replace("login.html?next=dashboard.html");
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

    renderNextTrip(document.getElementById("dash-trip"), nextTrip(bookings), names);
    renderSpend(document.getElementById("dash-spend-chart"), monthlySpend(bookings));
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

// A missing element or an unexpected shape must surface as a message, not as an
// unhandled rejection that leaves the page stuck on "Loading your dashboard…".
connectDashboard().catch((error) => {
  const status = document.getElementById("dash-status");
  if (!status) return;
  status.textContent = "Could not load your dashboard. Reload the page to try again.";
  status.dataset.state = "error";
  console.error("Dashboard failed:", error);
});

// Initials for the nav avatar: first letters of up to two names, falling back to
// the email's first character so there is always something to show.
function initials(account) {
  const words = (account.name || "").trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map(word => word[0]).join("");
  return (letters || (account.email || "?")[0]).toUpperCase();
}

// Nav state: once a session exists the Login link becomes a profile avatar that
// opens the dashboard, so every page shows whether the visitor is signed in.
// Failure leaves the nav exactly as the markup shipped it.
async function markNavState() {
  const link = document.querySelector('.nav-links a[href$="login.html"]');
  if (!link) return;
  try {
    const { account } = await send("/me");

    const avatar = document.createElement("span");
    avatar.className = "nav-avatar";
    avatar.textContent = initials(account);
    avatar.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "nav-account-label";
    label.textContent = "Dashboard";

    link.replaceChildren(avatar, label);
    link.href = "dashboard.html";
    link.classList.add("nav-account");
    // The avatar is decorative, so the link carries the whole description.
    link.setAttribute("aria-label", "Dashboard, signed in as " + account.email);
    link.title = "Signed in as " + account.email;
    if (window.location.pathname.endsWith("dashboard.html")) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  } catch {
    // Not signed in, or the lookup failed: the Login link stays as it is.
  }
}

markNavState();

// Password reset. The page shows the request form by default, and the new-password
// form when it is opened from an emailed link carrying ?token=.
const resetRequestForm = document.getElementById("reset-request-form");
const resetForm = document.getElementById("reset-form");
if (resetRequestForm && resetForm) {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const requesting = document.getElementById("reset-request-step");
  const choosing = document.getElementById("reset-step");
  if (/^[0-9a-f]{64}$/i.test(token)) {
    requesting.hidden = true;
    choosing.hidden = false;
  }

  const requestStatus = resetRequestForm.querySelector(".form-status");
  const requestButton = resetRequestForm.querySelector('[type="submit"]');
  resetRequestForm.noValidate = true;
  resetRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    requestButton.disabled = true;
    requestStatus.textContent = "Sending your reset link…";
    delete requestStatus.dataset.state;
    try {
      const { message } = await send("/reset-request", {
        email: document.getElementById("reset-email").value
      });
      requestStatus.textContent = message;
      requestStatus.dataset.state = "success";
    } catch (error) {
      requestStatus.textContent = error.message;
      requestStatus.dataset.state = "error";
    } finally {
      requestButton.disabled = false;
    }
  });

  const resetStatus = resetForm.querySelector(".form-status");
  const resetButton = resetForm.querySelector('[type="submit"]');
  resetForm.noValidate = true;
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("reset-password").value;
    const confirmation = document.getElementById("reset-confirm").value;
    const holder = document.getElementById("reset-confirm-error");
    holder.textContent = "";
    if (password !== confirmation) {
      holder.textContent = "Both passwords must match.";
      document.getElementById("reset-confirm").focus();
      return;
    }

    resetButton.disabled = true;
    resetStatus.textContent = "Updating your password…";
    delete resetStatus.dataset.state;
    try {
      const { message } = await send("/reset", { token, password });
      resetStatus.textContent = message;
      resetStatus.dataset.state = "success";
      window.setTimeout(() => window.location.assign("login.html"), 1200);
    } catch (error) {
      document.getElementById("reset-password-error").textContent = error.errors?.password || "";
      resetStatus.textContent = error.message;
      resetStatus.dataset.state = "error";
    } finally {
      resetButton.disabled = false;
    }
  });
}
