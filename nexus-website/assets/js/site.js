// Nexus website — small progressive enhancements. Every page works without JS.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Mobile menu
  const toggle = $(".nav-toggle");
  const nav = $("#nav");
  toggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav?.addEventListener("click", (e) => {
    if (e.target.closest("a")) { nav.classList.remove("is-open"); toggle?.setAttribute("aria-expanded", "false"); }
  });

  // Home: feature list filter
  const filter = $('[data-filter="features"]');
  filter?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    const cat = btn.dataset.cat;
    $$("button", filter).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    $$("#features-list li").forEach((li) => { li.hidden = cat !== "All" && li.dataset.cat !== cat; });
  });

  // What's new: page tour
  const tabs = $("[data-tour-tabs]");
  if (tabs) {
    const pages = [
      ["Home is a dashboard", "A spotlight on what you’re playing, or the best game you haven’t started, plus Up next, your week, streak, level, achievements, who’s live, and shelves like Finish in a weekend.", "home", "Home dashboard with the spotlight and cards"],
      ["A top bar, not a sidebar", "Search, your streak and level live in the top bar. The library gets filter chips for source, status, genre, critic score and mastery, with Completed and Archive one tab away.", "library", "Library grid with filter chips"],
      ["Quick view drawer", "Click a cover and a drawer slides in beside the library: play time, sessions, How Long to Beat, mastery and tags, without leaving the grid.", "quickview", "Quick view drawer open beside the library"],
      ["A real game page", "A full page with a ratings scorecard, How Long to Beat, screenshots, similar games and Twitch.", "game", "Game page with ratings and How Long to Beat"],
      ["Stats, side by side", "Side-by-side cards, comparisons with the previous period, a new activity chart, a streak heatmap and mastery tiers.", "stats", "Stats page with summary cards and an activity chart"],
      ["Almost there", "Progress towards locked achievements, an Almost there row, and rarity filters.", "achievements", "Achievements page with progress and rarity"],
      ["Twitch, rebuilt", "A following list, a featured stream, game filters, and channel pages with more live streams and top clips.", "twitch", "Twitch page with trending games and live streams"],
      ["Wrapped is a story", "Step through your month or year, with animated stats and optional autoplay.", "wrapped", "First slide of a Wrapped story"],
      ["Open a pack", "“What should I play?” now rips open a pack and flips over a card with your next game.", "pack-open", "A pack opened to reveal the next game"],
      ["Settings, as a page", "A full page with search. Every section is rebuilt, with a confirmation before anything destructive, and Theme Studio for presets, accents and fonts.", "themes-synthwave", "Theme Studio in Settings"],
    ];
    const btns = $$('[role="tab"]', tabs);
    let i = 0;
    const show = (n, focus) => {
      i = (n + pages.length) % pages.length;
      const [title, text, img, alt] = pages[i];
      btns.forEach((b, j) => { b.setAttribute("aria-selected", String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      if (focus) btns[i].focus();
      const image = $("[data-tour-img]");
      image.src = `assets/img/v1/${img}.webp`;
      image.alt = alt;
      $("[data-tour-num]").textContent = String(i + 1).padStart(2, "0");
      $("[data-tour-title]").textContent = title;
      $("[data-tour-text]").textContent = text;
      $("[data-tour-next-label]").textContent = btns[(i + 1) % pages.length].textContent;
    };
    tabs.addEventListener("click", (e) => { const j = btns.indexOf(e.target.closest('[role="tab"]')); if (j >= 0) show(j); });
    tabs.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") show(i + 1, true);
      if (e.key === "ArrowLeft") show(i - 1, true);
    });
    $("[data-tour-next]").addEventListener("click", () => show(i + 1));
    $("[data-tour-prev]").addEventListener("click", () => show(i - 1));
    // Warm the cache so switching tabs is instant.
    addEventListener("load", () => pages.forEach((p) => { new Image().src = `assets/img/v1/${p[2]}.webp`; }));
  }

  // Legal pages: highlight the section you're reading
  const toc = $$(".legal-toc a");
  if (toc.length) {
    const spy = new IntersectionObserver((seen) => {
      const hit = seen.find((s) => s.isIntersecting);
      if (hit) toc.forEach((a) => a.classList.toggle("is-current", a.hash === `#${hit.target.id}`));
    }, { rootMargin: "-80px 0px -70% 0px" });
    $$(".legal-section").forEach((s) => spy.observe(s));
  }

  // Changelog: two-column rows, version rail, collapsed earlier releases, search
  const timeline = $(".changelog-timeline");
  if (timeline) {
    const entries = $$(".changelog-entry", timeline);

    // "<strong>Name</strong> — text" becomes a name column and a text column.
    $$(".changelog-list > li, .changelog-highlights > li", timeline).forEach((li) => {
      if (li.firstChild?.nodeType === 3 && !li.firstChild.data.trim()) li.firstChild.remove();
      const first = li.firstChild;
      if (first?.nodeName !== "STRONG") return;
      const span = document.createElement("span");
      span.className = "cl-text";
      while (first.nextSibling && first.nextSibling.nodeName !== "UL") span.append(first.nextSibling);
      if (span.firstChild?.nodeType === 3) span.firstChild.data = span.firstChild.data.replace(/^\s*[—–-]\s*/, "");
      first.after(span);
    });

    const rail = $(".rail-list");
    entries.forEach((entry) => {
      const date = $(".changelog-entry-date", entry)?.textContent.split(",")[0].trim() ?? "";
      const a = document.createElement("a");
      a.href = `#${entry.id}`;
      a.innerHTML = `<span></span><small></small>`;
      a.firstChild.textContent = $(".changelog-entry-version", entry)?.textContent ?? entry.id;
      a.lastChild.textContent = date;
      rail?.append(a);
    });
    const links = rail ? $$("a", rail) : [];
    const mark = (id) => links.forEach((a) => a.classList.toggle("is-current", a.hash === `#${id}`));
    mark(entries[0]?.id);
    const spy = new IntersectionObserver((seen) => {
      const hit = seen.find((s) => s.isIntersecting);
      if (hit) mark(hit.target.id);
    }, { rootMargin: "-80px 0px -70% 0px" });
    entries.forEach((e) => spy.observe(e));

    // Everything after the two newest releases folds into rows.
    const older = entries.slice(2);
    let olderBox;
    if (older.length) {
      olderBox = document.createElement("section");
      olderBox.className = "cl-older";
      olderBox.innerHTML = `<h2>Earlier releases</h2><div class="cl-older-list"></div>`;
      older[0].before(olderBox);
      older.forEach((entry) => {
        $(".cl-older-list", olderBox).append(entry);
        entry.classList.add("is-collapsed");
        const header = $(".changelog-entry-header", entry);
        const summary = document.createElement("span");
        summary.className = "cl-summary";
        summary.textContent = ($(".changelog-entry-body > p", entry)?.textContent ?? "").replace(/\s+/g, " ").trim().split(/(?<=\.)\s/)[0];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cl-toggle";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-label", `Show notes for ${$(".changelog-entry-version", entry)?.textContent ?? entry.id}`);
        btn.addEventListener("click", () => {
          const open = entry.classList.toggle("is-open");
          btn.setAttribute("aria-expanded", String(open));
        });
        header.append(summary);
        header.insertAdjacentHTML("beforeend", '<svg class="cl-chev" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>');
        header.append(btn);
      });
    }
    // Rail links and #hash links open a folded release.
    const openHash = () => {
      const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
      if (target?.classList.contains("is-collapsed") && !target.classList.contains("is-open")) $(".cl-toggle", target)?.click();
    };
    addEventListener("hashchange", openHash);
    openHash();

    const search = $(".rail-search input");
    search?.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      entries.forEach((entry) => { entry.hidden = q !== "" && !entry.textContent.toLowerCase().includes(q); });
      if (olderBox) olderBox.hidden = older.every((e) => e.hidden);
      links.forEach((a, j) => { a.hidden = entries[j].hidden; });
    });
  }
})();
