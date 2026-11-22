// Admin charts, drawn as SVG through the DOM.
//
// No chart library and no inline styles: the admin Content-Security-Policy is
// default-src 'none' with style-src 'self', so an external script or a style
// attribute would be blocked. Colours and sizes come from classes in admin.css
// and from SVG presentation attributes, which CSP does not treat as inline style.
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
const count = new Intl.NumberFormat("en-IN");
const shortDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function emptyNote(container, message) {
  const note = document.createElement("p");
  note.className = "chart-empty";
  note.textContent = message;
  container.replaceChildren(note);
}

// Bookings per day for the last fortnight.
function drawDailyBookings(container, series) {
  if (!series.some(point => point.count > 0)) {
    emptyNote(container, "No bookings in the last 14 days.");
    return;
  }
  const width = 680;
  const height = 220;
  const padding = { top: 16, right: 8, bottom: 30, left: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const peak = Math.max(...series.map(point => point.count), 1);
  const step = plotWidth / series.length;
  const barWidth = Math.min(34, step * 0.62);

  const svg = node("svg", {
    class: "chart", viewBox: `0 0 ${width} ${height}`,
    role: "img", "aria-label": `Bookings per day for the last ${series.length} days`
  });

  // Horizontal guides, labelled with the count they represent.
  const guides = peak <= 4 ? peak : 4;
  for (let line = 0; line <= guides; line++) {
    const value = Math.round((peak / guides) * line);
    const y = padding.top + plotHeight - (value / peak) * plotHeight;
    svg.append(node("line", {
      class: "chart-guide", x1: padding.left, x2: width - padding.right, y1: y, y2: y
    }));
    svg.append(node("text", {
      class: "chart-axis", x: padding.left - 8, y: y + 4, "text-anchor": "end"
    }, String(value)));
  }

  series.forEach((point, index) => {
    const barHeight = point.count === 0 ? 0 : Math.max(3, (point.count / peak) * plotHeight);
    const x = padding.left + index * step + (step - barWidth) / 2;
    const y = padding.top + plotHeight - barHeight;
    if (barHeight > 0) {
      const bar = node("rect", {
        class: "chart-bar", x, y, width: barWidth, height: barHeight, rx: 4
      });
      bar.append(node("title", {}, `${point.date}: ${point.count} booking${point.count === 1 ? "" : "s"}`));
      svg.append(bar);
    }
    // Label every third day so the axis stays readable at this width.
    if (index % 3 === 0 || index === series.length - 1) {
      const parsed = Date.parse(point.date + "T00:00:00");
      svg.append(node("text", {
        class: "chart-axis", x: padding.left + index * step + step / 2,
        y: height - 10, "text-anchor": "middle"
      }, Number.isFinite(parsed) ? shortDay.format(parsed) : point.date));
    }
  });

  container.replaceChildren(svg);
}

// Which vehicles customers actually book.
function drawVehicleMix(container, vehicles, labels) {
  if (!vehicles.length) {
    emptyNote(container, "No vehicles booked yet.");
    return;
  }
  const rows = vehicles.slice(0, 6);
  const peak = Math.max(...rows.map(row => row.count), 1);
  const list = document.createElement("dl");
  list.className = "chart-bars";

  for (const row of rows) {
    const term = document.createElement("dt");
    term.textContent = labels.get(row.vehicle) || row.vehicle;
    const value = document.createElement("dd");

    const track = document.createElement("span");
    track.className = "chart-track";
    // An SVG rect scales to the bar width without needing a style attribute,
    // which the admin CSP would block.
    const bar = node("svg", {
      class: "chart-rowbar", viewBox: "0 0 100 10", preserveAspectRatio: "none",
      role: "presentation"
    });
    bar.append(node("rect", {
      class: "chart-bar", x: 0, y: 0, height: 10, rx: 2,
      width: Math.max(1.5, (row.count / peak) * 100)
    }));
    track.append(bar);

    const number = document.createElement("span");
    number.className = "chart-number";
    number.textContent = count.format(row.count);

    value.append(track, number);
    list.append(term, value);
  }
  container.replaceChildren(list);
}

// Upcoming / on rent / completed as a donut.
function drawStages(container, stages) {
  const entries = [
    ["upcoming", "Upcoming", stages.upcoming || 0],
    ["active", "On rent", stages.active || 0],
    ["completed", "Completed", stages.completed || 0]
  ];
  const total = entries.reduce((sum, [, , value]) => sum + value, 0);
  if (total === 0) {
    emptyNote(container, "No bookings yet.");
    return;
  }

  const size = 160;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const svg = node("svg", {
    class: "chart-donut", viewBox: `0 0 ${size} ${size}`,
    role: "img", "aria-label": `${total} bookings by stage`
  });
  svg.append(node("circle", {
    class: "chart-donut-track", cx: size / 2, cy: size / 2, r: radius, fill: "none", "stroke-width": 18
  }));

  let offset = 0;
  for (const [key, label, value] of entries) {
    if (value === 0) continue;
    const length = (value / total) * circumference;
    const arc = node("circle", {
      class: "chart-arc chart-arc--" + key,
      cx: size / 2, cy: size / 2, r: radius, fill: "none", "stroke-width": 18,
      "stroke-dasharray": `${length} ${circumference - length}`,
      "stroke-dashoffset": -offset,
      transform: `rotate(-90 ${size / 2} ${size / 2})`
    });
    arc.append(node("title", {}, `${label}: ${value}`));
    svg.append(arc);
    offset += length;
  }

  svg.append(node("text", {
    class: "chart-donut-value", x: size / 2, y: size / 2 - 2, "text-anchor": "middle"
  }, count.format(total)));
  svg.append(node("text", {
    class: "chart-donut-label", x: size / 2, y: size / 2 + 16, "text-anchor": "middle"
  }, total === 1 ? "booking" : "bookings"));

  const legend = document.createElement("ul");
  legend.className = "chart-legend";
  for (const [key, label, value] of entries) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "chart-swatch chart-swatch--" + key;
    const text = document.createElement("span");
    text.textContent = `${label} · ${count.format(value)}`;
    item.append(swatch, text);
    legend.append(item);
  }
  container.replaceChildren(svg, legend);
}

export function renderSummary(summary, labels) {
  const figures = [
    ["summary-bookings", count.format(summary.totals.bookings)],
    ["summary-revenue", money.format(summary.revenue)],
    ["summary-accounts", count.format(summary.totals.accounts)],
    ["summary-contacts", count.format(summary.totals.contacts)],
    ["summary-subscribers", count.format(summary.totals.subscribers)],
    ["summary-attributed", count.format(summary.totals.attributed) + " of " +
      count.format(summary.totals.bookings)]
  ];
  for (const [id, value] of figures) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  const capped = document.getElementById("summary-capped");
  if (capped) capped.hidden = !summary.capped;

  drawDailyBookings(document.getElementById("chart-daily"), summary.byDay);
  drawVehicleMix(document.getElementById("chart-vehicles"), summary.vehicles, labels);
  drawStages(document.getElementById("chart-stages"), summary.stages);
}
