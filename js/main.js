// TruckBhai — small bits of behaviour for the static pages.
document.addEventListener("DOMContentLoaded", function () {
  // Scale the fixed 1440px design down to fit narrower screens.
  var canvas = document.querySelector(".canvas");
  var page = document.querySelector(".page");
  function fitCanvas() {
    if (!canvas || !page) return;
    var available = document.documentElement.clientWidth;
    var scale = Math.min(1, available / 1440);
    page.style.transform = scale < 1 ? "scale(" + scale + ")" : "none";
    page.style.marginLeft = scale < 1 ? "0" : "auto";
    page.style.marginRight = scale < 1 ? "0" : "auto";
    canvas.style.height = page.offsetHeight * scale + "px";
  }
  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", fitCanvas);
  window.addEventListener("load", fitCanvas);


  // Booking / contact forms are static in the design, so just acknowledge them.
  document.querySelectorAll("form").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      form.reset();
    });
  });
});
