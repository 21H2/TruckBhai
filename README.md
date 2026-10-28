# TruckBhai

A static truck rental website with a Node.js server for local form storage.

## Run locally

Install Node.js 22 or newer, then run:

```sh
npm start
```

Open **http://127.0.0.1:3000**. No package installation is needed. To use another
port, run `PORT=3001 npm start`.

Open the site through this server for form submissions; opening `index.html`
directly or using a static-only server cannot save JSON files.

## Booking form

- Select one of the six listed trucks and enter a pickup location (3–200 characters).
- Pickup cannot be in the past. Return must be at least one calendar day after pickup.
- The browser and server both validate the details. Dates use the machine's local date.
- `POST /api/bookings` accepts JSON with `vehicle`, `pickup`, `pickupDate`, and
  `returnDate`. Vehicle IDs are defined in `js/booking.js`; dates use `YYYY-MM-DD`.
- Successful requests return HTTP 201 with a reference ID and append a record to
  `data/bookings.json`, created on the first successful submission. Each record
  includes `id` and `submittedAt` (UTC).
- Writes are queued within the running server and use a temporary file followed by
  rename, preventing overlapping submissions from losing existing records. Run one
  server process per data directory.
- Submitted JSON files are ignored by Git and cannot be downloaded through the
  site server. Data persists when the server restarts.
- The form retains entered details on an error and clears them only after saving.

This records a booking request locally; it does not reserve inventory or take payment.

## Rent Now buttons

Every truck card links to the booking form with its vehicle selected. On the home
page, selection happens without reloading, preserving entered location and dates.
From Vehicle Models, the link opens the home page using a `vehicle` query parameter
and the `#booking-form` anchor. Unrecognized vehicle IDs are ignored.

## Vehicle filters

The home and Vehicle Models pages filter the displayed cards by size and move
matching cards into the first available positions. Popular restores the full
featured collection. The current sample categorization is TATA Ace (small), EICHER
pro (medium), and EICHER 19, container and trailers (large); edit each card's
`data-category` to adjust the catalog.

## Contact form

The Contact page validates names (2–100 characters), email addresses (up to 254
characters), and messages (10–5,000 characters). `POST /api/contacts` accepts JSON
with `name`, `email`, and `message` and stores the trimmed values, reference ID,
and UTC timestamp in `data/contacts.json`. Errors appear beside each field. Failed
submissions retain the message; successful submissions clear the form.

This saves messages locally; email delivery is not configured.

## Newsletter form

Every page has a newsletter email field and Subscribe button. `POST /api/subscribers`
accepts JSON with `email`. Addresses are validated, trimmed, converted to lowercase,
and saved with their reference ID and UTC timestamp in `data/subscribers.json`.
Duplicate addresses return HTTP 409 with an inline error and are not saved again,
including simultaneous submissions or requests after a server restart.

This stores subscriptions locally; sending newsletters is not configured.

## Submission feedback

All three forms show field errors, saving status, and success references. Controls
are disabled while saving to prevent repeated submissions. Details clear only
after a successful server response and remain available after validation, server,
or network failures. A request that takes more than 15 seconds releases the controls
and displays a timeout message. A timeout cannot establish whether the server
finished saving; inspect local data before retrying if that matters.

Broader UX and responsive layout improvements are on hold.

## Checks

```sh
npm test
```

Tests exercise the HTTP request handler in process and save only in temporary
directories, never the site's `data/` folder. They do not require a listening port.
