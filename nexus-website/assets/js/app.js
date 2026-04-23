/* ════════════════════════════════════════════════════════════
   Nexus Website — shared interactions
   Single file, feature-detected per page. Vanilla JS, no deps.
   ════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Scroll progress bar ────────────────────────────
  function initScrollProgress() {
    const bar = document.querySelector(".scroll-progress");
    if (!bar) return;
    let ticking = false;
    function update() {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      bar.style.setProperty("--progress", pct + "%");
      ticking = false;
    }
    window.addEventListener("scroll", () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  // ── Mouse spotlight on hero ────────────────────────
  function initHeroSpotlight() {
    const hero = document.querySelector("[data-spotlight]");
    if (!hero || reducedMotion) return;
    hero.addEventListener("mousemove", (e) => {
      const rect = hero.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      hero.style.setProperty("--mx", mx + "%");
      hero.style.setProperty("--my", my + "%");
    });
  }

  // ── Count-up observer ──────────────────────────────
  function initCounters() {
    const counters = document.querySelectorAll("[data-count-to]");
    if (!counters.length) return;

    const animate = (el) => {
      const target = parseFloat(el.dataset.countTo);
      const duration = parseInt(el.dataset.countDuration || "1400", 10);
      const decimals = parseInt(el.dataset.countDecimals || "0", 10);
      const startedAt = performance.now();

      if (reducedMotion) {
        el.textContent = target.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
        return;
      }

      function tick(now) {
        const elapsed = Math.min(1, (now - startedAt) / duration);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - elapsed, 3);
        const current = target * eased;
        el.textContent = current.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
        if (elapsed < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    };

    if (!("IntersectionObserver" in window)) {
      counters.forEach(animate);
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animate(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    counters.forEach((c) => io.observe(c));
  }

  // ── Feature explorer filter pills ──────────────────
  function initFeatureFilters() {
    const root = document.querySelector("[data-feature-explorer]");
    if (!root) return;
    const pills = root.querySelectorAll("[data-filter]");
    const chips = root.querySelectorAll(".feature-chip");

    // Populate counts per pill
    pills.forEach((p) => {
      const cat = p.dataset.filter;
      const count = cat === "all"
        ? chips.length
        : Array.from(chips).filter((c) => c.dataset.cat === cat).length;
      const countEl = p.querySelector(".filter-pill-count");
      if (countEl) countEl.textContent = count.toString().padStart(2, "0");
    });

    pills.forEach((p) => {
      p.addEventListener("click", () => {
        pills.forEach((x) => x.setAttribute("aria-pressed", "false"));
        p.setAttribute("aria-pressed", "true");
        const cat = p.dataset.filter;
        chips.forEach((chip) => {
          chip.classList.toggle("is-hidden", cat !== "all" && chip.dataset.cat !== cat);
        });
      });
    });
  }

  // ── Changelog search + type filter ─────────────────
  function initChangelogFilter() {
    const stream = document.querySelector("[data-changelog-stream]");
    if (!stream) return;

    const search = document.querySelector("[data-changelog-search]");
    const typePills = document.querySelectorAll("[data-changelog-type]");
    const entries = stream.querySelectorAll(".changelog-entry");

    let currentType = "all";
    let currentQuery = "";

    function applyFilters() {
      let anyVisible = false;
      entries.forEach((entry) => {
        const text = entry.textContent.toLowerCase();
        const matchesQuery = !currentQuery || text.includes(currentQuery);

        const categories = entry.querySelectorAll(".changelog-category");
        let entryHasMatch = false;

        if (currentType === "all") {
          entryHasMatch = matchesQuery;
          categories.forEach((c) => (c.style.display = ""));
        } else {
          categories.forEach((c) => {
            const matches = c.dataset.type === currentType;
            c.style.display = matches ? "" : "none";
            if (matches && matchesQuery) entryHasMatch = true;
          });
        }

        entry.style.display = entryHasMatch ? "" : "none";
        if (entryHasMatch) anyVisible = true;
      });

      stream.classList.toggle("is-empty", !anyVisible);
    }

    if (search) {
      search.addEventListener("input", (e) => {
        currentQuery = e.target.value.trim().toLowerCase();
        applyFilters();
      });
    }

    typePills.forEach((p) => {
      p.addEventListener("click", () => {
        typePills.forEach((x) => x.setAttribute("aria-pressed", "false"));
        p.setAttribute("aria-pressed", "true");
        currentType = p.dataset.changelogType;
        applyFilters();
      });
    });
  }

  // ── Mobile changelog version dropdown ──────────────
  function initChangelogMobileSelect() {
    const sel = document.querySelector("[data-changelog-mobile-select]");
    if (!sel) return;
    sel.addEventListener("change", (e) => {
      const id = e.target.value;
      if (id) {
        const target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // ── Generic scroll-spy (active link in sticky rail / TOC) ──
  function initScrollSpy() {
    const groups = document.querySelectorAll("[data-scrollspy]");
    if (!groups.length || !("IntersectionObserver" in window)) return;

    groups.forEach((group) => {
      const targetSelector = group.dataset.scrollspy;
      const sections = document.querySelectorAll(targetSelector);
      if (!sections.length) return;

      const links = group.querySelectorAll("a[href^='#']");
      const linkMap = new Map();
      links.forEach((a) => linkMap.set(a.getAttribute("href").slice(1), a));

      const visible = new Set();

      const setActive = (id) => {
        links.forEach((a) => a.classList.remove("is-active"));
        const link = linkMap.get(id);
        if (link) {
          link.classList.add("is-active");
          // bring active link into view if rail is scrollable
          const rail = group;
          const ot = link.offsetTop;
          if (ot < rail.scrollTop || ot > rail.scrollTop + rail.clientHeight) {
            rail.scrollTo({ top: Math.max(0, ot - 24), behavior: "smooth" });
          }
        }
      };

      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });

        if (visible.size > 0) {
          // pick the topmost visible section
          let topId = null;
          let topY = Infinity;
          visible.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
              const y = el.getBoundingClientRect().top;
              if (y < topY) {
                topY = y;
                topId = id;
              }
            }
          });
          if (topId) setActive(topId);
        }
      }, {
        rootMargin: "-100px 0px -55% 0px",
        threshold: 0
      });

      sections.forEach((s) => io.observe(s));
    });
  }

  // ── Lucide icon refresh ────────────────────────────
  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  // ── Boot ───────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    refreshIcons();
    initScrollProgress();
    initHeroSpotlight();
    initCounters();
    initFeatureFilters();
    initChangelogFilter();
    initChangelogMobileSelect();
    initScrollSpy();
  });
})();
