// Sanjeevani — site interactions

document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".site-nav");
  const navLinks = document.querySelector(".nav-links");
  const navToggle = document.querySelector(".nav-toggle");
  const searchBtn = document.querySelector(".search-toggle");
  const searchBox = document.querySelector(".search-box");
  const searchInput = document.querySelector(".search-box input");
  const searchResults = document.querySelector(".search-results");
  const heroVideo = document.querySelector(".hero-media video");
  const heroFallback = document.querySelector(".hero-fallback");

  // Sticky nav background on scroll
  const onScroll = () => {
    nav.classList.toggle("scrolled", window.scrollY > 60);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile nav toggle
  if (navToggle) {
    navToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
    });
    navLinks.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => navLinks.classList.remove("open"))
    );
  }

  // Active link highlight via IntersectionObserver
  const sections = document.querySelectorAll("main section[id]");
  const linkMap = new Map();
  document.querySelectorAll(".nav-links a[href^='#']").forEach((a) => {
    linkMap.set(a.getAttribute("href").slice(1), a);
  });

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const link = linkMap.get(entry.target.id);
        if (!link) return;
        if (entry.isIntersecting) {
          linkMap.forEach((l) => l.classList.remove("active"));
          link.classList.add("active");
        }
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((s) => sectionObserver.observe(s));

  // Reveal-on-scroll
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

  // Pinned story cards — slow image zoom once in view, plus a scroll progress bar
  const pinCards = document.querySelectorAll(".pin-card");
  const pinObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("in-view", entry.isIntersecting);
      });
    },
    { threshold: 0.25 }
  );
  pinCards.forEach((card) => pinObserver.observe(card));

  function updatePinProgress() {
    const vh = window.innerHeight;
    pinCards.forEach((card) => {
      const fill = card.querySelector(".pin-progress-fill");
      if (!fill) return;
      const rect = card.getBoundingClientRect();
      const total = rect.height + vh;
      const traveled = vh - rect.top;
      const pct = Math.max(0, Math.min(1, traveled / total));
      fill.style.width = `${Math.round(pct * 100)}%`;
    });
  }

  let pinTicking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!pinTicking) {
        window.requestAnimationFrame(() => {
          updatePinProgress();
          pinTicking = false;
        });
        pinTicking = true;
      }
    },
    { passive: true }
  );
  updatePinProgress();

  // Search overlay
  const sectionIndex = Array.from(sections).map((s) => ({
    id: s.id,
    label: s.dataset.navLabel || s.querySelector("h2")?.textContent || s.id,
    text: s.textContent.toLowerCase(),
  }));

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      searchResults.classList.remove("show");
      searchResults.innerHTML = "";
      return;
    }
    const matches = sectionIndex.filter((s) => s.text.includes(q));
    searchResults.innerHTML = matches.length
      ? matches
          .map(
            (m) =>
              `<a href="#${m.id}"><span>Jump to</span>${m.label}</a>`
          )
          .join("")
      : `<p style="color:#9fc3ba;padding:0.6rem 0;">No matches for "${query}"</p>`;
    searchResults.classList.add("show");
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      searchBox.classList.toggle("open");
      if (searchBox.classList.contains("open")) searchInput.focus();
      else {
        searchResults.classList.remove("show");
        searchInput.value = "";
      }
    });
    searchInput.addEventListener("input", (e) => renderResults(e.target.value));
    searchResults.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        searchBox.classList.remove("open");
        searchResults.classList.remove("show");
        searchInput.value = "";
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchBox.classList.remove("open");
        searchResults.classList.remove("show");
      }
    });
  }

  // Hero video graceful fallback (poster / fallback image stays visible if video fails or is absent)
  if (heroVideo) {
    heroVideo.addEventListener("error", () => {
      heroVideo.style.display = "none";
      if (heroFallback) heroFallback.style.display = "block";
    });
    const sourceEl = heroVideo.querySelector("source");
    if (!sourceEl || !sourceEl.getAttribute("src")) {
      heroVideo.style.display = "none";
      if (heroFallback) heroFallback.style.display = "block";
    }
  }
});
