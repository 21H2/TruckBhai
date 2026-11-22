"use strict";

const login = document.getElementById("admin-login");
const dashboard = document.getElementById("admin-dashboard");

window.addEventListener("pageshow", event => {
  if (event.persisted) location.reload();
});

async function adminRequest(path, body) {
  const options = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.message), { status: response.status });
  }
  return data;
}

function updateStatus(element, text, error = false) {
  element.textContent = text;
  element.dataset.state = error ? "error" : "";
}

if (location.pathname === "/admin/login") {
  login.hidden = false;
  const form = document.getElementById("admin-login-form");
  const password = document.getElementById("admin-password");
  const button = form.querySelector("button");
  const status = document.getElementById("login-status");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    updateStatus(status, "Signing in…");
    try {
      await adminRequest("/api/v1/admin/login", { password: password.value });
      location.replace("/admin");
    } catch (error) {
      updateStatus(status, error.status ? error.message : "Could not sign in. Try again.", true);
      password.focus();
    } finally {
      password.value = "";
      button.disabled = false;
    }
  });
} else {
  dashboard.hidden = false;
  const headings = {
    bookings: {
      submittedAt: "Submitted", id: "Reference", vehicle: "Vehicle",
      pickup: "Pickup location", dropoff: "Drop-off location", pickupDate: "Pickup date",
      returnDate: "Return date", estimatedFareInr: "Fare"
    },
    contacts: { submittedAt: "Submitted", id: "Reference", name: "Name", email: "Email", message: "Message" },
    subscribers: { submittedAt: "Subscribed", id: "Reference", email: "Email" }
  };
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const currencyFormat = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  });
  const filters = [...document.querySelectorAll("[data-collection]")];
  const columns = document.getElementById("admin-columns");
  const rows = document.getElementById("admin-rows");
  const results = document.getElementById("admin-results");
  const pagination = document.getElementById("admin-pagination");
  const previous = document.getElementById("admin-previous");
  const next = document.getElementById("admin-next");
  const status = document.getElementById("admin-status");
  let collection = "bookings";
  let page = 1;
  let requestNumber = 0;

  function cell(tag, value) {
    const element = document.createElement(tag);
    if (tag === "th") element.scope = "col";
    element.textContent = value;
    return element;
  }

  function formatValue(key, value) {
    if (value == null || value === "") return "—";
    if (key === "submittedAt") {
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp)) return dateFormat.format(timestamp);
    }
    if (key === "estimatedFareInr" && Number.isFinite(value)) return currencyFormat.format(value);
    return String(value);
  }

  async function loadRecords() {
    const currentRequest = ++requestNumber;
    const activeFilter = filters.find(filter => filter.dataset.collection === collection);
    filters.forEach(filter => filter.setAttribute("aria-pressed", String(filter === activeFilter)));
    results.hidden = true;
    pagination.hidden = true;
    updateStatus(status, "Loading…");
    try {
      const data = await adminRequest(`/api/v1/admin/${collection}?page=${page}`);
      if (currentRequest !== requestNumber) return;
      const entries = Object.entries(headings[collection]);
      document.getElementById("admin-caption").textContent = activeFilter.textContent;
      columns.replaceChildren(...entries.map(([, label]) => cell("th", label)));
      rows.replaceChildren(...data.records.map(record => {
        const row = document.createElement("tr");
        row.append(...entries.map(([key]) => cell("td", formatValue(key, record[key]))));
        return row;
      }));
      results.hidden = data.records.length === 0;
      updateStatus(status, results.hidden ? "No submissions on this page." : "");
      previous.disabled = page === 1;
      next.disabled = !data.hasNext;
      document.getElementById("admin-page").textContent = `Page ${page}`;
      pagination.hidden = page === 1 && !data.hasNext;
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      if (error.status === 401) return location.replace("/admin/login");
      updateStatus(status, error.status ? error.message : "Could not load submissions. Try again.", true);
    }
  }

  filters.forEach(filter => filter.addEventListener("click", () => {
    collection = filter.dataset.collection;
    page = 1;
    loadRecords();
  }));
  previous.addEventListener("click", () => {
    page--;
    loadRecords();
  });
  next.addEventListener("click", () => {
    page++;
    loadRecords();
  });
  const logout = document.getElementById("admin-logout");
  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await adminRequest("/api/v1/admin/logout", {});
      location.replace("/admin/login");
    } catch (error) {
      updateStatus(status, error.status ? error.message : "Could not sign out. Try again.", true);
      logout.disabled = false;
    }
  });
  loadRecords();
}
