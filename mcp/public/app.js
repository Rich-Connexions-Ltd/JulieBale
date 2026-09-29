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

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Performance media: poster first, player on demand -------- */
  // Nothing heavy loads until the visitor presses play. Atmospheric loops
  // (data-loop) start muted when on screen, unless motion is reduced; the
  // player keeps its own pause control.
  var loadStream = function (btn, auto) {
    var uid = btn.getAttribute("data-stream");
    if (!/^[a-f0-9]{32}$/.test(uid || "")) return;
    var loop = btn.getAttribute("data-loop") === "1";
    var params = "autoplay=true" + (loop ? "&muted=true&loop=true" : "");
    var frame = document.createElement("iframe");
    frame.src = "https://iframe.videodelivery.net/" + uid + "?" + params;
    frame.title = btn.getAttribute("aria-label") || "Video";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.setAttribute("allowfullscreen", "");
    frame.className = "media-iframe";
    btn.replaceWith(frame);
    if (!auto) frame.focus();
  };
  document.querySelectorAll(".media-play[data-stream]").forEach(function (btn) {
    btn.addEventListener("click", function () { loadStream(btn, false); });
    if (btn.getAttribute("data-loop") === "1" && !prefersReduced && "IntersectionObserver" in window) {
      var loopIo = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { loopIo.disconnect(); loadStream(btn, true); }
      }, { threshold: 0.4 });
      loopIo.observe(btn);
    }
  });

  // Editorial video (#26): muted loops that play only while on screen and
  // never under reduced motion. The toggle replaces the native controls; a
  // visitor's pause sticks.
  var editorial = [];
  document.querySelectorAll("video.media-video").forEach(function (video) {
    var scene = video.closest(".media-scene");
    var toggle = scene && scene.querySelector("[data-video-toggle]");
    if (!toggle) return;
    var label = toggle.getAttribute("data-label") || "video";
    var paused = prefersReduced;
    var show = function (playing) {
      toggle.classList.toggle("is-playing", playing);
      toggle.setAttribute("aria-label", (playing ? "Pause " : "Play ") + label);
    };
    var play = function () {
      var p = video.play();
      if (p && p.catch) p.catch(function () { show(false); });
    };
    // A derivative's speed only ever slows it (allowlisted values).
    var speed = parseFloat(video.getAttribute("data-speed"));
    if (speed === 0.5 || speed === 0.75) { video.defaultPlaybackRate = speed; video.playbackRate = speed; }
    video.removeAttribute("controls");
    toggle.hidden = false;
    video.addEventListener("play", function () { show(true); });
    video.addEventListener("pause", function () { show(false); });
    toggle.addEventListener("click", function () {
      if (video.paused) { paused = false; play(); } else { paused = true; video.pause(); }
    });
    // Observe the frame, not the video: a cropped video is scaled beyond its
    // frame, so its own visible share would stay small even when fully on screen.
    editorial.push({ video: video, frame: video.parentElement || video, play: play, isPaused: function () { return paused; } });
  });
  // Always observed, so nothing plays off screen, even a video the visitor
  // started under reduced motion; it only starts by itself when motion is allowed.
  if (editorial.length && "IntersectionObserver" in window) {
    var videoIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        editorial.forEach(function (e) {
          if (e.frame !== entry.target) return;
          if (entry.isIntersecting && !prefersReduced && !e.isPaused()) e.play();
          else if (!entry.isIntersecting && !e.video.paused) e.video.pause();
        });
      });
    }, { threshold: 0.35 });
    editorial.forEach(function (e) { videoIo.observe(e.frame); });
  }

  /* ---- Testimonial carousel: visitor-driven, never auto-advances -- */
  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var track = root.querySelector(".carousel__track");
    var slides = track ? track.children : [];
    var count = root.querySelector(".carousel__count");
    if (!track || !slides.length) return;
    var index = function () { return Math.round(track.scrollLeft / Math.max(track.clientWidth, 1)); };
    var go = function (i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: i * track.clientWidth, behavior: prefersReduced ? "auto" : "smooth" });
    };
    var prev = root.querySelector(".carousel__prev");
    var next = root.querySelector(".carousel__next");
    if (prev) prev.addEventListener("click", function () { go(index() - 1); });
    if (next) next.addEventListener("click", function () { go(index() + 1); });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(index() + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index() - 1); }
    });
    var ticking = false;
    track.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        if (count) count.textContent = (index() + 1) + " / " + slides.length;
        ticking = false;
      });
    }, { passive: true });
  });

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
