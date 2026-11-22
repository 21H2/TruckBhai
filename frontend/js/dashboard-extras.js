// Customer dashboard extras: the next-trip card and the monthly spend chart.
// Drawn as SVG through the DOM so the dashboard needs no chart dependency, and
// every figure comes from the account's own bookings.
const SVG = "http://www.w3.org/2000/svg";

function node(name, attributes = {}, text) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  if (text !== undefined) element.textContent = text;
  return element;
}

const money = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
});
const monthLabel = new Intl.DateTimeFormat(undefined, { month: "short" });
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

function daysUntil(date) {
  const target = Date.parse(date + "T00:00:00");
  if (!Number.isFinite(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

// The trip that matters right now: the one on rent, else the soonest upcoming.
export function nextTrip(bookings) {
  const active = bookings.find(booking => booking.stage === "active");
  if (active) return active;
  return bookings
    .filter(booking => booking.stage === "upcoming")
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate))[0] || null;
}

export function renderNextTrip(container, booking, vehicleNames) {
  if (!booking) {
    container.hidden = true;
    return;
  }
  const away = daysUntil(booking.pickupDate);
  const heading = booking.stage === "active" ? "On rent now"
    : away === 0 ? "Pickup today"
    : away === 1 ? "Pickup tomorrow"
    : away > 1 ? `Pickup in ${away} days`
    : "Next trip";

  const parsedPickup = Date.parse(booking.pickupDate + "T00:00:00");
  const rows = [
    ["Vehicle", vehicleNames.get(booking.vehicle) || booking.vehicle],
    ["Route", booking.dropoff ? booking.pickup + " → " + booking.dropoff : booking.pickup],
    ["Pickup", Number.isFinite(parsedPickup) ? longDate.format(parsedPickup) : booking.pickupDate],
    ["Reference", booking.id],
    ["Estimated fare", Number.isFinite(booking.estimatedFareInr)
      ? money.format(booking.estimatedFareInr) : "Not estimated"]
  ];

  const title = document.createElement("h2");
  title.className = "trip-heading";
  title.textContent = heading;

  const list = document.createElement("dl");
  list.className = "trip-details";
  for (const [term, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    if (term === "Reference") dd.className = "dash-ref";
    list.append(dt, dd);
  }

  const actions = document.createElement("div");
  actions.className = "dash-actions";
  const track = document.createElement("a");
  track.className = "btn-dark";
  track.href = "track.html";
  track.textContent = "Track this booking";
  const support = document.createElement("a");
  support.className = "btn-dark";
  support.href = "contact.html";
  support.textContent = "Get support";
  actions.append(track, support);

  container.replaceChildren(title, list, actions);
  container.hidden = false;
}

// Spend by month, oldest first, across the last six months.
export function monthlySpend(bookings, now = new Date()) {
  const months = [];
  for (let back = 5; back >= 0; back--) {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
    months.push({ key: date.toISOString().slice(0, 7), date, total: 0 });
  }
  const index = new Map(months.map(month => [month.key, month]));
  for (const booking of bookings) {
    if (!Number.isFinite(booking.estimatedFareInr)) continue;
    const key = typeof booking.pickupDate === "string" ? booking.pickupDate.slice(0, 7) : null;
    const month = key && index.get(key);
    if (month) month.total += booking.estimatedFareInr;
  }
  return months;
}

export function renderSpend(container, months) {
  if (!months.some(month => month.total > 0)) {
    const note = document.createElement("p");
    note.className = "chart-empty";
    note.textContent = "No fares estimated in the last six months.";
    container.replaceChildren(note);
    return;
  }

  const width = 520;
  const height = 180;
  const padding = { top: 14, bottom: 28, left: 10, right: 10 };
  const plotHeight = height - padding.top - padding.bottom;
  const peak = Math.max(...months.map(month => month.total), 1);
  const step = (width - padding.left - padding.right) / months.length;
  const barWidth = Math.min(46, step * 0.5);

  const svg = node("svg", {
    class: "chart", viewBox: `0 0 ${width} ${height}`,
    role: "img", "aria-label": "Estimated spend by month"
  });

  months.forEach((month, position) => {
    const barHeight = month.total === 0 ? 0 : Math.max(3, (month.total / peak) * plotHeight);
    const x = padding.left + position * step + (step - barWidth) / 2;
    const y = padding.top + plotHeight - barHeight;
    if (barHeight > 0) {
      const bar = node("rect", { class: "chart-bar", x, y, width: barWidth, height: barHeight, rx: 4 });
      bar.append(node("title", {}, `${monthLabel.format(month.date)}: ${money.format(month.total)}`));
      svg.append(bar);
    }
    svg.append(node("text", {
      class: "chart-axis", x: padding.left + position * step + step / 2,
      y: height - 9, "text-anchor": "middle"
    }, monthLabel.format(month.date)));
  });

  container.replaceChildren(svg);
}
