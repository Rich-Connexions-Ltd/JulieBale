/* Julie Bale — minimal vanilla JS: mobile nav + scroll reveal */
(function () {
  "use strict";

  /* ---- Mobile navigation ------------------------------------ */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("primary-nav");

  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      nav.setAttribute("data-open", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    // Close on link tap (mobile) and on Escape
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
  }

  /* ---- Masthead scroll-shrink ------------------------------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        header.classList.toggle("is-scrolled", window.scrollY > 32);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---- Scene navigation (design.scene_nav) ------------------- */
  // Marks the chapter currently in the middle of the screen; the nav links
  // work without this (plain #chapter-NN anchors).
  var sceneNav = document.querySelector(".scene-nav");
  if (sceneNav && "IntersectionObserver" in window) {
    var chapterLinks = {};
    sceneNav.querySelectorAll("a[data-chapter]").forEach(function (a) {
      chapterLinks[a.getAttribute("data-chapter")] = a;
    });
    var currentChapter = null;
    var chapterIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = chapterLinks[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          if (currentChapter) currentChapter.removeAttribute("aria-current");
          link.setAttribute("aria-current", "location");
          currentChapter = link;
          sceneNav.classList.add("is-active");
        } else if (currentChapter === link) {
          link.removeAttribute("aria-current");
          currentChapter = null;
          sceneNav.classList.remove("is-active");
        }
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    Object.keys(chapterLinks).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) chapterIo.observe(section);
    });
  }

  /* ---- Scroll reveal (single blocks + staggered groups) ----- */
  // Tell the <head> guard that motion is running, so it keeps html.js.
  window.__jbMotion = true;
  // Sections with a chosen motion, gold rule or chapter mark reveal the same way.
  var reveals = document.querySelectorAll(".reveal, .stagger, [data-motion], .s-rule, .s-chapter, .s-transition-wipe, .s-transition-crossfade, .s-transition-divider");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });

  reveals.forEach(function (el) { io.observe(el); });
})();
