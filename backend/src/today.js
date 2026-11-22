// One definition of "today" for the whole server.
//
// Booking dates are plain YYYY-MM-DD in the operating country, so comparing them
// against a UTC date is wrong for every hour the local date and the UTC date
// disagree: in IST that is 05:30 every day, during which a booking picking up
// today reads as upcoming and one that ended yesterday reads as still active.
// BUSINESS_TIMEZONE pins the comparison to the business's own clock instead of
// whatever TZ the host happens to use.
const defaultZone = "Asia/Kolkata";

function formatter(env) {
  const timeZone = env.BUSINESS_TIMEZONE?.trim() || defaultZone;
  try {
    // en-CA gives YYYY-MM-DD directly.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit"
    });
  } catch {
    // An invalid zone must not break every date comparison on the server.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: defaultZone, year: "numeric", month: "2-digit", day: "2-digit"
    });
  }
}

export function businessToday(now = new Date(), env = process.env) {
  return formatter(env).format(now);
}

// The business-timezone calendar day a stored UTC timestamp falls on. Bucketing a
// submittedAt by its own UTC date while the axis is built in business time would
// drop records into the wrong day near midnight.
export function businessDate(timestamp, env = process.env) {
  const parsed = typeof timestamp === "string" ? Date.parse(timestamp) : Number(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return formatter(env).format(new Date(parsed));
}

// The last `days` dates ending today, oldest first, in the business timezone.
export function recentDays(days, now = new Date(), env = process.env) {
  const today = businessToday(now, env);
  const anchor = Date.parse(today + "T00:00:00Z");
  const dates = [];
  for (let back = days - 1; back >= 0; back--) {
    dates.push(new Date(anchor - back * 86_400_000).toISOString().slice(0, 10));
  }
  return dates;
}
