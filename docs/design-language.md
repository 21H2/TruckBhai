# TruckBhai design language

How to build a new page that looks like it belongs. Every value here was read out
of `frontend/css/styles.css` on `main`; nothing is aspirational.

## 1. The layout model

The site uses **two layout models at once**, and picking the right one is the first
decision for any new page.

### Model A — the scaled canvas (all customer pages)

`index.html`, `about.html`, `contact.html`, `our-team.html`, `testimonials.html`,
`vehicle-models.html`, `login.html` and `dashboard.html` all use it.

```html
<div class="canvas">
  <main class="page" style="height:2595.715px">
    <!-- absolutely positioned children at fixed pixel offsets -->
  </main>
</div>
```

`.page` is a fixed **1440px** wide design surface. `fitCanvas()` in
`frontend/js/main.js` measures `canvas.clientWidth / page.offsetWidth` and applies
`transform: scale()` with `transform-origin: top left`, then sets the canvas height
to the scaled height. Below 1440px the whole page shrinks proportionally; it does
not reflow.

Consequences you must respect:

- Children are positioned with exact `left` / `top` pixel values, usually inline.
- `.page` needs a height. Because absolutely positioned children contribute nothing
  to flow height, the height is normally hardcoded inline.
- **Hardcoded heights are the main source of clipping bugs.** `.page` has
  `overflow: hidden`, so anything taller than the declared height is silently cut
  off, and a card whose text wraps to one more line than you estimated will run
  under the footer. Prefer the flow escape hatch below for any new page whose
  content height you cannot compute exactly.

#### The flow escape hatch (used by `login.html` and `dashboard.html`)

Instead of guessing a page height, let the content measure itself:

```html
<main class="page login-page">          <!-- no inline height -->
  <section class="login-stage">         <!-- position: relative; padding: 200px 0 96px -->
    <div class="page-hero">…</div>      <!-- absolute, anchors to the stage padding box -->
    <h1 class="page-title">…</h1>
    <section class="login-card">…</section>  <!-- position: relative; margin: 0 auto -->
  </section>
  <footer class="footer footer--inner footer--flow">…</footer>
</main>
```

- The stage is `position: relative`, so `.page-hero`, `.page-title` and
  `.page-crumb` keep their existing absolute coordinates unchanged (absolute boxes
  resolve against the **padding box**, so `top: 0` is still the stage's top edge).
- The card is `position: relative` with `z-index: 2`. Relative rather than static
  matters twice: static elements paint *below* absolutely positioned siblings, so a
  static card would disappear behind `.page-hero`, and `position` also establishes
  the backdrop for `backdrop-filter`.
- `.footer--flow` makes the footer `position: relative` instead of `absolute` so it
  follows the content. Relative, not static: the footer's own children are
  absolutely positioned against it, so it has to remain a containing block.
- `fitCanvas()` reads `page.offsetHeight`, which works fine with an auto height.

### Model B — fluid (admin only)

`/admin` is a data tool, not a brochure page. It uses no `.canvas` or `.page`; it is
a normal responsive document with `max-width: 1280px` and `clamp()` padding. Use
Model B for anything table-driven or operational.

### The nav sits outside both

`.nav` is a sibling of `.canvas`, directly in `<body>`, so it never scales with the
page:

```html
<nav class="nav nav--dark" aria-label="Main">
  <a class="logo" href="index.html">…</a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav-links">Menu</button>
  <ul class="nav-links" id="main-nav-links">…</ul>
</nav>
```

Copy this block verbatim on every page. Three requirements:

1. `.nav-toggle` **must** exist. `main.js` does
   `nav.querySelector(".nav-toggle").addEventListener(...)` with no null check, so
   omitting it throws and kills every other script on the page.
2. The `<ul>` id must match the button's `aria-controls`, because the mobile
   open state is driven by `.nav-toggle[aria-expanded="true"] + .nav-links`.
   The button must stay the `<ul>`'s immediate previous sibling.
4. Mark the current page with `aria-current="page"` on its link.

`.nav--dark` switches the text to `#1e1e1e` for light hero images. Use it on every
inner page; `index.html` uses the light variant over its dark hero.

## 2. Tokens

Only `--nav-height` exists as a custom property (`64px`, dropping to `56px` under
760px). Everything else is a literal, so the table below is the de-facto palette.
When you add a page, reuse these exact values rather than inventing neighbours.

### Colour

| Role | Value | Notes |
|---|---|---|
| Page surface | `#fff` | `body` and `.page` background |
| Primary text | `#0f0f0f` | `body` colour |
| Nav text, dark variant | `#1e1e1e` | `.nav--dark` only |
| Brand accent (red) | `#f3494a` | the "Bhai" in the logo, primary action |
| Brand accent, pressed | `#d93b3c` | hover/active for red buttons |
| Logo underline red | `#f14648` | inside the inline SVG only |
| Brand blue | `#2456bc` | mobile nav background |
| About card blue | `#2947a9` | `.about-card` |
| Link blue | `#007ec0` | secondary links |
| Focus ring yellow | `#f8d254` | **always** the focus colour |
| Deep indigo text | `#1e0e62` | DM Sans form copy |
| Muted surface | `#f5f5f5` | panels, inactive chips |
| Input border | `#ebeaed` | 2px form borders |
| Error text | `#a32121` | `.form-status[data-state="error"]`, `.field-error` |
| Error on dark | `#ffb4b4` | footer newsletter errors |
| Success text | `#146537` | `.form-status[data-state="success"]` |
| Success on dark | `#99e8b3` | footer newsletter success |
| Footer surface | `#0f0f0f` | `.footer` |

Known near-duplicates, left as-is deliberately so this doc describes reality: the
two reds `#f3494a` / `#f14648`, and `#0f0f0f` / `#1e1e1e` / `#000` for dark text.
If you unify them, do it in one pass across the whole stylesheet.

### Type

Eight families load from Google Fonts on every page. Roles:

| Role | Family | Size / weight / line-height |
|---|---|---|
| Body default | Montserrat | `400 16px` |
| Logo wordmark | Poppins | `600 24px` |
| Nav links | Lato | `600 clamp(14px, 1.111vw, 16px) / 24px`, `letter-spacing: .16px`, capitalised |
| Page title | Poppins | `700 32px / 1.3`, `letter-spacing: -.64px` |
| Breadcrumb | Poppins | `600 16px` |
| Section heading | Poppins | `clamp(28px, 4vw, 42px) / 1.15` on admin, `.title-48` on canvas pages |
| Form copy and inputs | DM Sans | `500 16-18px`, colour `#1e0e62` |
| Footer | Cabin | `400 13-15px` |
| About card | Work Sans | `600-700` |
| Testimonial attribution | Inter | `600 16px / 19.36px` |

`Mulish` is loaded and used once; `"Montserrat Booking"` is a local alias that falls
back to Montserrat. Don't add a ninth family.

## 3. The hero blend

This is the signature of the site: a photograph pressed between a dark shade and a
white wash so dark text reads on top of it.

```html
<div class="page-hero">
  <div class="shade"></div>
  <img class="fit cover bottom" src="images/page-hero.png" alt="Row of trucks" />
  <div class="wash"></div>
</div>
<h1 class="page-title">Login</h1>
<p class="page-crumb">Home / login</p>
```

The recipe, exactly:

| Layer | Declaration |
|---|---|
| Frame | `position: absolute; left: 0; top: 0; width: 1440px; height: 297.825px; overflow: hidden` |
| `.shade` | `inset: 0; background: rgba(0, 0, 0, 0.18)` |
| Image | `.fit .cover .bottom` → `inset: 0; width/height: 100%; object-fit: cover; object-position: bottom` |
| `.wash` | `inset: 0; linear-gradient(to bottom, rgba(255,255,255,.32), rgba(255,255,255,.63))` |

Order matters: shade, then image, then wash. The shade darkens, the wash lifts the
bottom edge toward white so `.page-title` in `#000` stays legible and the banner
fades into the white page.

`images/page-hero.png` is **2880 × 596**, a 4.83:1 banner. At 1440px wide its
natural height is 298px, which is why the frame is `297.825px`. Do not stretch it
to a tall full-page background: `cover` would crop away more than half its width
and upscale the rest. If you need a taller blend, either use a taller source image
or let a card straddle the banner's bottom edge, which is what `login.html` does.

`.page-title` sits at `left: 86.62px; top: 117.11px` and `.page-crumb` at
`left: 86.62px; top: 162.89px`. Keep those offsets so the header lines up across
pages. Use `<h1>` for the title on a page that has no other `<h1>`.

## 4. Components

### Glass card (`.login-card`, `.dash-card`, `.admin-panel`)

The translucent panel that lets the hero photo show through. Introduced for the
login page; reuse it rather than making another variant.

```css
border-radius: 16px;
border: 1px solid rgba(255, 255, 255, 0.72);
background: rgba(255, 255, 255, 0.74);
backdrop-filter: blur(20px) saturate(140%);
-webkit-backdrop-filter: blur(20px) saturate(140%);
box-shadow: 0 20px 24px -4px rgba(16, 24, 40, 0.12), 0 8px 8px -4px rgba(16, 24, 40, 0.04);
```

Always ship the `-webkit-` prefix; Safari still needs it. The element must be
positioned (`relative` is enough) or the backdrop is not sampled. Only place a
glass card where something visually interesting is behind it — over flat white it
just looks like a slightly grey box; prefer `.cta-card` there.

### Solid card (`.cta-card`)

For content over white: `border-radius: 16px`,
`background: linear-gradient(#fff, #f9f9f9 40px)`,
`box-shadow: 0 20px 24px -8px rgba(16,24,40,.20), 0 4px 10px rgba(16,24,40,.09)`,
`padding: clamp(16px, 2vw, 26px)`.

### Buttons

| Class | Use | Style |
|---|---|---|
| `.btn-dark` | default action | `#0f0f0f` on `#fff`, `border-radius: 64px`, `padding: 16px 24px`, Montserrat 700, lifts `translateY(-1px)` on hover |
| `.login-submit` | primary auth action | `#f3494a` → `#d93b3c`, `height: 52px`, `border-radius: 100px`, DM Sans 700 17px |
| `.about-card .btn` | on a coloured card | white fill, `2px solid #2947a9`, `border-radius: 6px` |
| `.admin-filters button` | segmented filter | `#f5f5f5`, `border-radius: 24px`, `#f8d254` when `aria-pressed="true"` |

Every interactive element gets `outline: 3px solid #f8d254` with a 2-3px offset on
`:focus-visible`. This is not optional; it is the only focus affordance in the
system.

### Inputs

Two shapes, both DM Sans:

- **Pill** (`.login-field input`, `.contact-form input`): `height: 50px`,
  `border-radius: 100px`, `padding: 0 20px`, `2px solid #ebeaed` (1px with a
  translucent border on glass), text `#1e0e62`, placeholder
  `rgba(21, 20, 57, 0.4)`. On focus, border `#f3494a` plus a
  `0 0 0 3px rgba(243,73,74,.18)` ring.
- **Rounded rect** (`.contact-form textarea`): `border-radius: 10px`,
  `padding: 13px 19px`, `resize: none`.

### Form status and errors

`main.js`'s `connectForm()` imposes a contract. A form it manages **must** contain:

```html
<p class="field-error" id="<field-id>-error"></p>   <!-- one per input, id = field id + "-error" -->
<p class="form-status" role="status"></p>           <!-- exactly one -->
```

It looks up error elements by `field.id + "-error"` but reads messages from
`errors[field.name]`, so ids and names both matter. It dereferences `.form-status`
and `[type="submit"]` without null checks — omit either and the first keystroke
throws a `TypeError`. `.form-status` carries `data-state="error"` or `"success"`.

Empty `.field-error` / `.form-status` elements are hidden with `:empty` rules, so
leave them in the markup.

### Footer

Copy the whole `<footer class="footer footer--inner">` block verbatim, including the
newsletter form. It is byte-identical across all pages today; keep it that way.
`.footer` is `position: absolute; width: 1440px; height: 374.715px` on a solid
`#0f0f0f`, with children at fixed offsets. Add `.footer--flow` on a flow-layout
page. The newsletter form must keep `id="newsletter-form"`,
`action="/api/v1/subscribers"`, `id="newsletter-email"` and the matching
`#newsletter-email-error`, or `main.js` won't wire it. `main.js` uses
`querySelector`, singular, so there is exactly one newsletter form per page.

## 5. Page inventory

| Page | Layout | Purpose | Backed by |
|---|---|---|---|
| `index.html` | A, fixed height | home, booking form | `POST /api/v1/bookings` |
| `about.html` | A, fixed height | company copy | — |
| `vehicle-models.html` | A, fixed height | catalogue, filters | — |
| `testimonials.html` | A, fixed height | reviews | — |
| `our-team.html` | A, fixed height | team | — |
| `contact.html` | A, fixed height | enquiry form | `POST /api/v1/contacts` |
| `login.html` | A, flow | customer sign-in | `POST /api/v1/account/login`, real |
| `signup.html` | A, flow | customer registration | `POST /api/v1/account/register`, real |
| `forgot-password.html` | A, flow | reset request and new password | `POST /api/v1/account/reset-request` + `/reset`, real |
| `dashboard.html` | A, flow | customer bookings overview | `GET /api/v1/account/me` + `/bookings`, real |
| `track.html` | A, flow | look up a booking by reference | `GET /api/v1/bookings/:reference`, real |
| `drive-with-us.html` | A, flow | driver partner application | `POST /api/v1/contacts`, real |
| `help.html` | A, flow | FAQ, native `<details>` | — |
| `business.html` | A, flow | enterprise enquiry | `POST /api/v1/contacts`, real |
| `terms.html` | A, flow | terms, prose card | — |
| `privacy.html` | A, flow | privacy policy, prose card | — |
| `not-found.html` | A, flow | styled 404 | served by `app.js` on unknown page paths |
| `/admin` | B, fluid | submissions dashboard | `GET /api/v1/admin/*`, session-gated |

Every page carries the newsletter form, so every page posts to
`POST /api/v1/subscribers`.

### Navigation and footer are global

The nav has eight items: Home, About Us, Vehicle Models, Track, Testimonials,
Our team, Contact Us, Login. The footer's Company column links to Rent Details
(`vehicle-models.html`), Drive with us, Help, Terms and Conditions, and Privacy
Policy. Both blocks are byte-identical on all 17 customer pages; the admin
page uses the same nav with absolute `/` hrefs because it is not served from the
frontend directory. Change them on every page at once or not at all.

`signup.html`, `forgot-password.html`, `drive-with-us.html`, `business.html`,
`help.html`, `terms.html`, `privacy.html` and `not-found.html` are deliberately not
in the nav. They are reached from the login
card, the footer, and the 404 handler respectively.

### Reusing a wired form on a new page

`main.js` only wires three selectors: `#contact-form`, `#newsletter-form` and
`#booking-form`. A new page that needs a working enquiry form should therefore
reuse `id="contact-form"` with `action="/api/v1/contacts"` and the field ids
`contact-name`, `contact-email`, `contact-message`, which is exactly what
`drive-with-us.html` does. No JavaScript change is needed and validation, error
display, the disabled-while-saving state and the reference message all come free.
Only one such form can exist per page, because the lookup is `querySelector`.

### Charts without a chart library

The admin overview and the dashboard spend chart are SVG built through
`document.createElementNS`, in `js/admin-charts.js` and `js/dashboard-extras.js`.
There is no charting dependency, for two reasons: the admin CSP is
`default-src 'none'` with `script-src 'self'`, so a CDN script is blocked outright,
and a `style` attribute would need `style-src 'unsafe-inline'`.

So: colours and sizes come from classes in the stylesheets and from SVG
presentation attributes such as `fill`, `width` and `stroke-dasharray`, which CSP
does not count as inline style. A horizontal bar is an SVG `rect` inside a
`viewBox="0 0 100 10"` with `preserveAspectRatio="none"`, which scales to any
percentage without a style attribute. Every chart has
`role="img"` with an `aria-label`, each bar carries a `<title>` for its tooltip,
and an empty data set renders a sentence instead of empty axes.

### The nav reflects sign-in state

`js/account.js` runs on all 17 pages and calls `GET /api/v1/account/me`. On a 200
it rewrites the nav's Login link to point at the dashboard. On any failure the link
is left exactly as the markup shipped it, so a signed-out visitor, a network error
and a disabled script all produce the same correct result.

### The tracking flow

`track.html` loads its own module, `js/track.js`, alongside `main.js`. It posts
nothing: it reads `GET /api/v1/bookings/:reference` and renders a four-step
timeline. The stage shown comes from the server, which derives it by comparing the
stored `pickupDate` and `returnDate` against today. No status field is stored or
invented, so the timeline can never disagree with the booking. The endpoint returns
a whitelist of eight fields and never the stored coordinates or fare inputs, and
the reference is a v4 UUID, which is what makes it safe to treat as the only
credential for the lookup.

### The 404 handler

`app.js`'s static fallback serves `not-found.html` with status 404, but only for a
`GET` that `accepts("html")` and has no file extension. A missing asset, a blocked
path like `/data/contacts.json`, and every `HEAD` request still get the JSON body,
which is what the test suite asserts.

## 6. Adding a page: the checklist

1. Add the filename to the `pages` set in `backend/src/app.js`. The static handler
   serves only names in that set plus assets matching
   `/^(?:css|js|images)\/[a-zA-Z0-9_.-]+$/`, so an unregistered page 404s.
2. Copy the `<head>` from `about.html`: the eight-family font link,
   `css/styles.css?v=5`, and `<script type="module" src="js/main.js?v=esm"></script>`.
   The scripts are ES modules on this branch.
3. **Bump the `?v=` token on every page when you edit a stylesheet.** Assets are
   served `Cache-Control: public, max-age=300` while HTML is `no-cache`, so without
   a new token a browser renders new markup against a stylesheet up to five minutes
   stale. That mismatch shows up as content overflowing or clipping at the bottom of
   a canvas page, because `.page` heights are declared in CSS. All 17 pages currently
   share `?v=5`; keep them in step.
4. Copy the nav verbatim, set `aria-current="page"`, keep `.nav-toggle`.
5. Choose a layout model from section 1. Prefer the flow escape hatch for new pages.
6. Add the hero blend and the title/crumb pair at their standard offsets.
7. Copy the footer verbatim.
8. Point forms at `/api/v1/...` and satisfy the `connectForm` contract.
9. Check the focus ring on every interactive element.
10. If the page should be reachable, add it to the nav on **all** pages or link it
   from the footer; otherwise note why it is unlisted.

## 7. Admin pages and the CSP

`/admin` is served by `backend/src/controllers/admin.controller.js`, not the static
handler, and it sets a deliberately tight Content-Security-Policy:

```
default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com; connect-src 'self'; form-action 'self';
base-uri 'none'; frame-ancestors 'none'; img-src 'self' data:
```

That means **no inline `<style>` and no inline `<script>` or `style=` attributes on
admin pages.** Everything must live in `frontend/css/admin.css` and
`frontend/js/admin.js`. `img-src 'self' data:` is the minimum needed for the hero
photograph and for the logo underline, which is a `data:` SVG inside
`styles.css` — before `img-src` was added, the underline was silently blocked.

The admin markup is also an API contract with `admin.js`, which looks up elements by
id with no null guards. Preserve these ids when restyling: `admin-login`,
`admin-login-form`, `admin-password`, `login-status`, `admin-dashboard`,
`admin-status`, `admin-results`, `admin-caption`, `admin-columns`, `admin-rows`,
`admin-pagination`, `admin-previous`, `admin-page`, `admin-next`, `admin-logout`,
plus the three `[data-collection]` filter buttons and the `hidden` attributes that
`admin.js` toggles.

## 8. Authentication status

Be precise about this when extending the UI.

- **Admin auth is real.** scrypt-derived password in `ADMIN_PASSWORD_HASH` as a
  `salt:hash` pair matching `/^([0-9a-f]{32}):([0-9a-f]{128})$/i`, compared with
  `timingSafeEqual`; 64-hex session tokens in memory with an 8-hour expiry, capped
  at 20 sessions; `HttpOnly; SameSite=Strict` cookie, `__Host-` prefixed and
  `Secure` when `ADMIN_SECURE_COOKIE=true`; five login attempts per minute then a
  429 with `Retry-After`. The listing endpoints project only whitelisted columns.
- **Customer auth is real too.** `POST /api/v1/account/register` and `/login`
  hash with scrypt and a per-account 16-byte salt, compare with `timingSafeEqual`,
  and set an opaque 64-hex session token in an `HttpOnly; SameSite=Strict` cookie
  lasting 7 days. Sign-in is rate limited to five attempts per email per minute.
  A wrong password and an unknown email return the identical 401 message, so the
  endpoint cannot be used to discover which addresses have accounts.
  `GET /api/v1/account/me` and `/bookings` require the session, and `/bookings`
  filters on the session's own email so one customer can never see another's.
  Sessions live in memory, so a restart signs everyone out: the same trade-off the
  admin dashboard already makes.
- **A booking is attributed server side.** When the booking form is submitted with
  a valid account session, the controller stamps `accountEmail` onto the record
  from the session, never from the request body. Anonymous bookings stay
  unattributed and are reachable only by their reference.
- **Password reset is real.** `POST /api/v1/account/reset-request` creates a
  64-hex single-use token valid for 30 minutes, held server side and delivered
  only by email. The reply is identical whether or not the address has an account.
  `POST /api/v1/account/reset` redeems it: it checks the token, sets a new scrypt
  hash, deletes the token and **drops every existing session for that account**, so
  a stolen session cannot outlive the password it was created with. A rejected
  password leaves the token usable so the customer can retry. With no
  `EMAILJS_RESET_TEMPLATE_ID` the request still returns 200, so the response never
  leaks mail configuration, and the server logs a warning instead.

Never trust an email address from a request body to decide what a customer may
read. The only trustworthy source is the session cookie.

Do not wire the customer pages to the admin endpoints to make them "work". Those
endpoints are gated on the admin session on purpose, and the collections hold other
customers' names, emails and messages.
