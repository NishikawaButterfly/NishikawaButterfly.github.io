// Mobile navigation toggle and current-page marker.
// The site works without this file; it only improves the header.
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");

  if (toggle && nav) {
    toggle.hidden = false;

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  // Mark the nav link that points at the current page.
  var here = location.pathname.replace(/index\.html$/, "");
  var links = document.querySelectorAll(".site-nav a");
  for (var i = 0; i < links.length; i += 1) {
    var path = new URL(links[i].href).pathname.replace(/index\.html$/, "");
    if (path === here) {
      links[i].setAttribute("aria-current", "page");
    }
  }
})();
