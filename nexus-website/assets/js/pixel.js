/* ══════════════════════════════════════════════════════════════
   NEXUS — PIXEL EDITION · landing page interactions
   Vanilla, no deps. Everything degrades to a working static page.
   ══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Opt this document in to JS-gated hiding. Runs immediately (the script
  // is deferred, so this lands before first paint) — never inside a
  // DOMContentLoaded handler, or the page would flash unstyled first.
  document.documentElement.classList.add("js");

  /* ── Scroll meter ─────────────────────────────────────── */
  function scrollMeter() {
    var bar = $(".progress");
    if (!bar) return;
    var queued = false;
    function paint() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.setProperty("--progress", (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%");
      queued = false;
    }
    addEventListener("scroll", function () {
      if (!queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
    paint();
  }

  /* ── Data dust ────────────────────────────────────────── */
  // ponytail: CSS-animated spans, not canvas — the compositor does the
  // work and there is no per-frame JS. Bump COUNT if it needs to be denser.
  function dust() {
    var host = $(".dust");
    if (!host || reduced) return;
    var COUNT = window.innerWidth < 720 ? 18 : 44;
    var kinds = ["", "b", "c", "d"];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < COUNT; i++) {
      var p = document.createElement("i");
      p.className = kinds[(Math.random() * kinds.length) | 0];
      p.style.left = (Math.random() * 100).toFixed(2) + "%";
      p.style.top = (100 + Math.random() * 40).toFixed(2) + "%";
      p.style.setProperty("--dx", ((Math.random() * 120) - 60).toFixed(0) + "px");
      p.style.animationDuration = (14 + Math.random() * 26).toFixed(1) + "s";
      p.style.animationDelay = (-Math.random() * 30).toFixed(1) + "s";
      frag.appendChild(p);
    }
    host.appendChild(frag);
  }

  /* ── Count-up on reveal ───────────────────────────────── */
  function counters() {
    var els = $$("[data-count-to]");
    if (!els.length) return;

    function fmt(n, d) {
      return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    function run(el) {
      var target = parseFloat(el.dataset.countTo);
      var dec = parseInt(el.dataset.countDecimals || "0", 10);
      var pad = parseInt(el.dataset.countPad || "0", 10);
      var dur = parseInt(el.dataset.countDuration || "1200", 10);
      var t0 = performance.now();

      function write(v) {
        var s = fmt(v, dec);
        el.textContent = pad ? s.padStart(pad, "0") : s;
      }
      if (reduced) { write(target); return; }

      (function tick(now) {
        var t = Math.min(1, (now - t0) / dur);
        // stepped easing — numbers should tick up like a scoreboard
        write(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(tick);
      })(t0);
    }

    if (!("IntersectionObserver" in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── Screen-wipe reveals ──────────────────────────────── */
  function reveals() {
    var els = $$("[data-reveal]");
    if (!els.length) return;

    function show(el, delay) {
      if (el.classList.contains("is-in")) return;
      setTimeout(function () {
        el.classList.add("is-in");
        // Drop the clip once the wipe lands — inset(0) still crops the
        // pixel drop-shadows, which sit outside the border box.
        setTimeout(function () { el.style.clipPath = "none"; }, 620);
      }, delay || 0);
    }

    if (reduced || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); el.style.clipPath = "none"; });
      return;
    }

    // threshold 0 — fire the moment any sliver crosses the edge. A ratio
    // threshold silently never fires for blocks taller than the viewport,
    // which is exactly the case for the tall panels on this page.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        // stagger siblings so a grid wipes in sequence, not all at once
        show(e.target, parseInt(e.target.dataset.revealDelay || "0", 10));
        io.unobserve(e.target);
      });
    }, { threshold: 0, rootMargin: "0px 0px 10% 0px" });
    els.forEach(function (el) { io.observe(el); });

    // ponytail: belt-and-braces. If the observer is starved for any reason
    // (bfcache restore, headless render, zoomed-out layout), nothing on this
    // page is allowed to stay invisible. Reveal the stragglers after 2.5s.
    setTimeout(function () {
      els.forEach(function (el) {
        if (!el.classList.contains("is-in") && el.getBoundingClientRect().top < innerHeight * 1.5) show(el, 0);
      });
    }, 2500);
  }

  /* ── Catalogue filter tabs ────────────────────────────── */
  function catalogue() {
    var root = $("[data-catalogue]");
    if (!root) return;
    var tabs = $$("[data-filter]", root);
    var rows = $$(".cat-row", root);
    var live = $("[data-catalogue-count]", root);

    tabs.forEach(function (tab) {
      var cat = tab.dataset.filter;
      var n = cat === "all" ? rows.length : rows.filter(function (r) { return r.dataset.cat === cat; }).length;
      var slot = $(".tab-n", tab);
      if (slot) slot.textContent = "[" + String(n).padStart(2, "0") + "]";
    });

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.setAttribute("aria-pressed", "false"); });
        tab.setAttribute("aria-pressed", "true");
        var cat = tab.dataset.filter;
        var shown = 0;
        rows.forEach(function (row) {
          var hide = cat !== "all" && row.dataset.cat !== cat;
          row.classList.toggle("is-hidden", hide);
          if (!hide) shown++;
        });
        if (live) live.textContent = shown + " features shown";
      });
    });
  }

  /* ── Mobile nav ───────────────────────────────────────── */
  function nav() {
    var btn = $(".nav-toggle");
    var menu = $("#nav-menu");
    if (!btn || !menu) return;
    btn.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        menu.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ── Changelog: search + type filter ──────────────────── */
  function changelogFilter() {
    var stream = $("[data-changelog-stream]");
    if (!stream) return;
    var search = $("[data-changelog-search]");
    var pills = $$("[data-changelog-type]");
    var entries = $$(".changelog-entry", stream);
    var type = "all", query = "";

    function apply() {
      var any = false;
      entries.forEach(function (entry) {
        var matchesQuery = !query || entry.textContent.toLowerCase().indexOf(query) !== -1;
        var cats = $$(".changelog-category", entry);
        var hit = false;
        if (type === "all") {
          hit = matchesQuery;
          cats.forEach(function (c) { c.style.display = ""; });
        } else {
          cats.forEach(function (c) {
            var m = c.dataset.type === type;
            c.style.display = m ? "" : "none";
            if (m && matchesQuery) hit = true;
          });
        }
        entry.style.display = hit ? "" : "none";
        if (hit) any = true;
      });
      stream.classList.toggle("is-empty", !any);
    }

    if (search) {
      search.addEventListener("input", function (e) {
        query = e.target.value.trim().toLowerCase();
        apply();
      });
    }
    pills.forEach(function (p) {
      p.addEventListener("click", function () {
        pills.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        p.setAttribute("aria-pressed", "true");
        type = p.dataset.changelogType;
        apply();
      });
    });
  }

  /* ── Changelog: mobile jump-to-version select ─────────── */
  function changelogJump() {
    var sel = $("[data-changelog-mobile-select]");
    if (!sel) return;
    sel.addEventListener("change", function (e) {
      var target = e.target.value && document.getElementById(e.target.value);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ── Scroll-spy for the sticky version rail ───────────── */
  function scrollSpy() {
    var groups = $$("[data-scrollspy]");
    if (!groups.length || !("IntersectionObserver" in window)) return;

    groups.forEach(function (group) {
      var sections = $$(group.dataset.scrollspy);
      if (!sections.length) return;
      var links = $$("a[href^='#']", group);
      var byId = {};
      links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
      var visible = new Set();

      function setActive(id) {
        links.forEach(function (a) { a.classList.remove("is-active"); });
        var link = byId[id];
        if (!link) return;
        link.classList.add("is-active");
        var ot = link.offsetTop;
        if (ot < group.scrollTop || ot > group.scrollTop + group.clientHeight) {
          group.scrollTo({ top: Math.max(0, ot - 24), behavior: "smooth" });
        }
      }

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        });
        var topId = null, topY = Infinity;
        visible.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) {
            var y = el.getBoundingClientRect().top;
            if (y < topY) { topY = y; topId = id; }
          }
        });
        if (topId) setActive(topId);
      }, { rootMargin: "-100px 0px -55% 0px", threshold: 0 });

      sections.forEach(function (s) { io.observe(s); });
    });
  }

  /* ── Boot line ────────────────────────────────────────── */
  // Types the hero's boot log one character at a time, steps-style.
  function boot() {
    var el = $("[data-boot]");
    if (!el) return;
    var text = el.dataset.boot;
    if (reduced) { el.textContent = text; return; }
    var i = 0;
    (function step() {
      el.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(step, 26);
    })();
  }

  document.addEventListener("DOMContentLoaded", function () {
    scrollMeter();
    dust();
    counters();
    reveals();
    catalogue();
    nav();
    boot();
    changelogFilter();
    changelogJump();
    scrollSpy();
  });
})();
