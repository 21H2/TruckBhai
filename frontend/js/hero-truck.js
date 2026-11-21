(() => {
  const truck = document.querySelector(".home-hero .hero-truck");
  const arrival = truck.querySelector(".hero-truck-arrival");
  const parked = truck.querySelector(".hero-truck-parked");
  const desktop = window.matchMedia("(min-width: 761px) and (not (pointer: coarse))");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let waiting = true;
  let inView = false;
  let finishTimer;

  function park() {
    clearTimeout(finishTimer);
    waiting = false;
    truck.classList.remove("is-arriving");
    truck.disabled = false;
  }

  function startWhenVisible() {
    if (!waiting || !desktop.matches || document.hidden || !inView) return;
    // The shorter clip shows only the final approach and the two headlight flashes.
    const source = motion.matches ? arrival.dataset.shortSrc : arrival.dataset.src;
    if (arrival.getAttribute("src") !== source) {
      arrival.src = source;
      return;
    }
    if (!arrival.complete || !arrival.naturalWidth) return;

    waiting = false;
    // Reassigning the loaded image source restarts its animation, including on cached visits.
    arrival.src = source;
    truck.classList.add("is-arriving");
    truck.disabled = true;
    finishTimer = setTimeout(() => {
      truck.disabled = false;
      if (parked.complete && parked.naturalWidth) park();
      else parked.addEventListener("load", park, { once: true });
    }, motion.matches ? 1550 : 3000);
  }

  truck.addEventListener("click", () => {
    truck.setAttribute("aria-pressed", String(truck.getAttribute("aria-pressed") !== "true"));
  });
  arrival.addEventListener("load", startWhenVisible);
  arrival.addEventListener("error", park);
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    startWhenVisible();
  });
  observer.observe(truck);
  document.addEventListener("visibilitychange", startWhenVisible);
  window.addEventListener("pageshow", event => {
    if (event.persisted && desktop.matches) {
      clearTimeout(finishTimer);
      parked.removeEventListener("load", park);
      truck.classList.remove("is-arriving");
      truck.setAttribute("aria-pressed", "false");
      waiting = true;
      startWhenVisible();
    }
  });
  motion.addEventListener("change", () => {
    if (waiting) startWhenVisible();
    else if (motion.matches) park();
  });
  desktop.addEventListener("change", () => {
    if (!desktop.matches) park();
  });
  if (!desktop.matches) park();
})();
