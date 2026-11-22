# TruckBhai

A static truck rental website with a Node.js server for form submissions.

## Project layout

- `frontend/` contains the HTML pages, styles, images, browser scripts, and browser interaction tests. The server also uses the validators in `frontend/js/`.
- `backend/` contains the Node.js server, MongoDB configuration, JSON import script, local submission storage, and API tests.
- The npm manifest and lockfile sit at the project root.

## Run locally

Install Node.js 22 or newer. Run these commands from the project folder:

```sh
npm ci
cp backend/.env.example backend/.env
npm start
```

The example connects to a running MongoDB server at `127.0.0.1:27017`. For Atlas
or another deployment, set `MONGODB_URI` in `backend/.env` to its connection string before
starting the app. `MONGODB_DB` selects the database and defaults to `truckbhai`.
The server creates a unique index on subscriber email at startup.

Open **http://127.0.0.1:3000** to use the forms. To use another port, run
`PORT=3001 npm start`. With `MONGODB_URI` unset, the server runs in local JSON
mode and saves submissions to `backend/data/*.json`. Run one server process per JSON
data directory. Git ignores both these files and `backend/.env`, and the site server
keeps them private.

### Import existing submissions

Stop the app before switching from JSON storage. With MongoDB configured, run
`npm run import:json` and start the app again. The import copies the three local
JSON files into their corresponding collections and preserves reference IDs and
timestamps. You can rerun it safely. It skips existing booking and contact IDs
and existing subscriber emails. The original files remain available under `backend/data/`.

## Booking form

- Search the six-truck catalog and select a vehicle. Enter pickup and dropoff locations
  (3–200 characters each). India-based suggestions appear after three characters.
- Click **Book now** to open the map and journey preview inside the form. The browser
  looks up any typed addresses you did not select from the suggestions. If the route
  is unavailable, it shows a labeled BML Munjal University to Agra example route of
  199.3 km. Drive time uses OSRM's route duration and the estimated fare adds rental days × daily rate to one-way petrol cost
  (distance ÷ mileage × pickup reference price). Electric rentals show the rental charge only. Click **Confirm booking** to save the entered details.
- Pickup cannot be in the past. Return must be at least one calendar day after pickup.
- The browser and server both validate the details. Dates use the machine's local date.
- `POST /api/v1/bookings` accepts JSON with `vehicle`, `pickup`, `dropoff`, `pickupDate`,
  and `returnDate`, plus optional `pickupCoordinates` and `dropoffCoordinates` objects
  with numeric `lat` and `lon` fields. New trip requests store these fields and the
  server-calculated `estimatedFareInr`. The API also accepts the original pickup-only
  request format. Vehicle IDs live in `frontend/js/booking.js`. Dates use `YYYY-MM-DD`.
- Successful requests return HTTP 201 with a reference ID and save a record in
  the `bookings` collection. Each record includes `id` and `submittedAt` (UTC).
- The form retains entered details on an error and clears them only after saving.

This records a booking request. Inventory reservations and payments are outside
this workflow.

### Map providers

The server hosts Leaflet and the booking form's Montserrat font. The browser loads
OpenStreetMap tiles and can draw the route line even if those tiles are unavailable. The server
queries Photon for location suggestions and OSRM for road routes. Set `PHOTON_URL`
to a Photon search endpoint and `OSRM_URL` to the base of an OSRM-compatible server
to override the defaults. Local development defaults to the public OSRM demo for
low-volume, non-commercial testing. With `NODE_ENV=production`, configure `OSRM_URL`
for live route previews. The BML Munjal University campus suggestion is built in and
uses the verified campus pin. The route preview uses driving directions for its road
distance estimate.

## Rent Now buttons

Every truck card links to the booking form with its vehicle selected. On the home
page, selection happens without reloading, preserving entered location and dates.
From Vehicle Models, the link opens the home page using a `vehicle` query parameter
and the `#booking-form` anchor. Unrecognized vehicle IDs are ignored.

## Vehicle filters

The home and Vehicle Models pages filter the displayed cards by size and move
matching cards into the first available positions. Popular restores the full
featured collection. Initially all trucks are visible and all filter buttons are
white; hovering or selecting a button gives it a black background and white text.
The current sample categorization is TATA Ace (small), EICHER
pro (medium), and EICHER 19, container and trailers (large); edit each card's
`data-category` to adjust the catalog.

## Contact form

The Contact page validates names (2–100 characters), email addresses (up to 254
characters), and messages (10–5,000 characters). `POST /api/v1/contacts` accepts JSON
with `name`, `email`, and `message` and stores the trimmed values, reference ID,
and UTC timestamp in the `contacts` collection. Errors appear beside each field.
Failed submissions retain the message. Successful submissions clear the form.

## Newsletter form

Every page has a newsletter email field and Subscribe button. `POST /api/v1/subscribers`
accepts JSON with `email`. Addresses are validated, trimmed, converted to lowercase,
and saved with their reference ID and UTC timestamp in the `subscribers` collection.
The unique email index prevents duplicates across concurrent requests and restarts.
Duplicate addresses return HTTP 409 with an inline error.

## EmailJS confirmations

Connect Gmail under [Email Services](https://dashboard.emailjs.com/admin).
Set both templates’ **To Email** field to `{{email}}`. Enter the service ID,
public key, and template IDs in the ignored `backend/.env` file, using
`backend/.env.example` as a guide. Allow requests from non-browser applications
in [EmailJS Account Security](https://dashboard.emailjs.com/admin/account/security).
If private-key authorization is enabled there, set `EMAILJS_PRIVATE_KEY` locally.
Restart TruckBhai with `npm start`.

TruckBhai calls EmailJS after saving a contact message or a new subscription.
The contact template receives `name`, `email`, `message`, and `reference_id`.
The newsletter template receives `email`. A delivery failure leaves the
submission saved and logs its reference ID.

## Submission feedback

All three forms show field errors and saving status. Bookings and contact messages
show a success reference; newsletter subscriptions simply show “Subscribed!”. Controls
are disabled while saving to prevent repeated submissions. Details clear only
after a successful server response and remain available after validation, server,
or network failures. A request that takes more than 15 seconds releases the controls
and displays a timeout message. A timeout cannot establish whether the server
finished saving. Check the active storage before retrying if that matters.

Broader UX and responsive layout improvements are on hold.

## Checks

```sh
npm test
```

Tests exercise the HTTP request handler in process and save only in temporary
directories. They do not require a listening port.

## Admin dashboard

Open `/admin` to view saved bookings, contact messages, and newsletter
subscribers. The dashboard is disabled until you set `ADMIN_PASSWORD_HASH` in
`backend/.env` (or set `ADMIN_SECOND_PASSWORD_HASH`). To generate a hash from a password without putting the password
in shell history, run this from the project directory in Bash.

```bash
read -rsp 'New admin password: ' truckbhai_admin_password
printf '\n'
printf '%s' "$truckbhai_admin_password" | node --input-type=module -e '
  import { randomBytes, scryptSync } from "node:crypto";
  import { readFileSync } from "node:fs";
  const password = readFileSync(0);
  if (password.length < 16) throw new Error("Use at least 16 characters.");
  const salt = randomBytes(16);
  console.log("ADMIN_PASSWORD_HASH=" + salt.toString("hex") + ":" + scryptSync(password, salt, 64).toString("hex"));
'
unset truckbhai_admin_password
```

Copy the generated line into `backend/.env`. To add a second password, generate
another hash, use `ADMIN_SECOND_PASSWORD_HASH` for that line, and keep the first
entry. Either password opens the same dashboard. Remove its line and restart
the server to revoke a password and clear existing sessions.

Restart the server after configuration changes. For an HTTPS
deployment, set `ADMIN_SECURE_COOKIE=true` and have the reverse proxy preserve
the public `Host` header. Sessions expire after eight hours and are cleared on
logout or server restart. The login rate limit applies to the single admin
account across all visitors.

## Customer accounts

Visitors can create an account, sign in and see their own bookings.

- `POST /api/v1/account/register` takes `name`, `email`, optional `phone` and
  `password`. Validation is shared with the browser through `registration()` in
  `frontend/js/forms.js`. Passwords are 8–128 characters.
- Passwords are stored only as a scrypt `salt:key` pair with a per-account
  16-byte salt, compared using `timingSafeEqual`. No plaintext password is written
  anywhere, and the stored hash is never returned by any endpoint.
- Registering or signing in sets an opaque 64-hex session token in an
  `HttpOnly; SameSite=Strict` cookie that lasts 7 days. Set
  `ADMIN_SECURE_COOKIE=true` when serving over HTTPS to add `Secure` and the
  `__Host-` prefix.
- `POST /api/v1/account/login` is limited to five attempts per email per minute,
  then returns 429 with `Retry-After`. A wrong password and an unknown email give
  the same 401 message, so the endpoint cannot reveal which addresses are
  registered.
- `GET /api/v1/account/me` returns the signed-in name, email and phone.
  `GET /api/v1/account/bookings` returns that customer's bookings, filtered on the
  email held in the session rather than anything in the request.
- `POST /api/v1/account/logout` ends the session and clears the cookie.
- Sessions are held in memory. Restarting the server signs everyone out.

`signup.html`, `login.html` and `dashboard.html` drive these endpoints through
`frontend/js/account.js`. The dashboard redirects to the login page on a 401.

## Password reset

`POST /api/v1/account/reset-request` takes an `email` and creates a 64-hex
single-use token that lasts 30 minutes. The token is held server side and sent out
only as a link in the reset email, `forgot-password.html?token=...`. The reply is
the same whether or not the address has an account, so the endpoint cannot be used
to discover registered addresses, and requests are rate limited per email.

`POST /api/v1/account/reset` takes `token` and `password`. It sets a new scrypt
hash, deletes the token so it cannot be reused, and signs out every existing
session for that account. A password that fails validation leaves the token usable
so the customer can try again.

Set `EMAILJS_RESET_TEMPLATE_ID` for the link to be delivered; the template receives
`name` and `reset_link`. Without it the request still returns 200, so the response
never reveals mail configuration, and the server logs a warning instead.

## Booking attribution

A booking submitted while signed in gets an `accountEmail` field, taken from the
session on the server and never from the request body. Those bookings appear on the
customer's dashboard. Bookings made without signing in stay unattributed and are
reachable only through their reference.

## Tracking a booking

`GET /api/v1/bookings/:reference` returns one booking for the reference shown after
a successful submission. The reference is a v4 UUID, which is what makes it safe to
treat as the only credential for the lookup. The response carries a whitelist of
eight fields and never the stored coordinates or fare inputs, and the stage
(upcoming, active, completed) is derived from the stored dates rather than stored,
so it cannot drift out of step with the booking. `track.html` renders it as a
four-step timeline.

## MongoDB

With `MONGODB_URI` set the app stores everything in MongoDB through Mongoose;
without it, the same data goes to JSON files under `backend/data/`. The startup log
says which: `(MongoDB storage)` or `(JSON storage)`.

```sh
brew tap mongodb/brew && brew install mongodb-community
brew services start mongodb-community
```

Then set `MONGODB_URI=mongodb://127.0.0.1:27017` and `MONGODB_DB=truckbhai` in
`backend/.env`. Collections are `bookings`, `contacts`, `subscribers`, `users` and
`vehicles`. Both `subscribers.email` and `users.email` carry a unique index, so
duplicates are rejected by the database and not only by application code.

Run `npm run import:json` once to copy existing `backend/data/*.json` records into
MongoDB. It skips records already present, so it is safe to run again.

## Welcome email

Set `EMAILJS_WELCOME_TEMPLATE_ID` to send a welcome message when an account is
created. The template receives `email` and `name`. Without that variable nothing is
sent and account creation is unaffected; a failed send is logged and never turns a
created account into a failed response.

## Admin overview

`GET /api/v1/admin/summary` returns everything the admin charts need in one
request, behind the admin session: totals for bookings, contacts, subscribers and
accounts, estimated revenue, the split of bookings by stage, bookings per day for
the last 14 days, and the vehicle mix. Bookings are read newest first and capped at
2,000 so a large collection cannot be pulled into memory wholesale.

The charts are SVG drawn in `frontend/js/admin-charts.js` with no charting
dependency, because the admin CSP blocks both external scripts and inline styles.

## Running behind a reverse proxy

Set `PUBLIC_ORIGIN` to the origin browsers actually use, for example
`https://truckbhai.example`. Every state-changing endpoint checks the request's
`Origin` against it, and password reset links are built from it.

Without it the expected origin is derived from `request.protocol`, which Express
reads from `X-Forwarded-Proto` because `trust proxy` is set to one hop. If neither
is right, a browser on HTTPS sends `Origin: https://host` while the server expects
`http://host`, and every form returns 403 "Submit this form from this website."

## Dates and timezones

Booking dates are plain `YYYY-MM-DD` in the operating country, so the server
compares them against the date in `BUSINESS_TIMEZONE`, which defaults to
`Asia/Kolkata`. `backend/src/today.js` is the only place that decides what "today"
means.

Using the UTC date instead would be wrong for the 5 hours 30 minutes each day when
the UTC date and the Indian date disagree: a booking picking up today would read as
upcoming, and one that ended yesterday would read as still on rent. The admin
chart's 14-day axis and its per-day buckets both use the same timezone, so a
booking cannot land in a bar it does not belong to.

## Fares

`estimateFare` in `frontend/js/booking.js` charges the daily rate for the number of
days, plus fuel for the road distance at the vehicle's mileage and the current pump
price for the fuel it burns. Diesel vehicles are priced from the diesel price and
the petrol Ace from the petrol price.

Each class has its own rate and mileage in `backend/src/fuel.js`: from ₹1,200/day at
13.5 km/L for the Ace to ₹5,800/day at 3 km/L for the refrigerated trailer. A
vehicle whose mileage or pump price is missing yields no estimate rather than a
silently fuel-free trip.

Run `db.vehicles.deleteMany({})` and restart to reseed the fleet after changing
those specifications; `seedVehicles` only inserts, so it will not overwrite
existing documents.
