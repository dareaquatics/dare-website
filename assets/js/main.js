(function () {
  "use strict";

  /* ── Dark mode ─────────────────────────────────────────── */
  function getTheme() {
    const saved = localStorage.getItem("dare-theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    syncToggleIcon(theme);
  }

  function syncToggleIcon(theme) {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    const icon = btn.querySelector("i");
    if (!icon) return;
    icon.className = theme === "dark" ? "bi bi-sun" : "bi bi-moon";
  }

  function toggleTheme() {
    const current = getTheme();
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("dare-theme", next);
    applyTheme(next);
  }

  /* ── Scroll nav ────────────────────────────────────────── */
  function initScrollNav() {
    const header = document.getElementById("header");
    if (!header) return;
    function onScroll() {
      header.dataset.scrolled = window.scrollY > 40 ? "true" : "false";
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ── Mobile nav ────────────────────────────────────────── */
  function initMobileNav() {
    const hamburger = document.getElementById("nav-hamburger");
    const overlay   = document.getElementById("nav-mobile-overlay");
    const backdrop  = document.getElementById("nav-backdrop");
    const closeBtn  = document.getElementById("nav-close");
    if (!hamburger || !overlay) return;

    function closeMenu() {
      overlay.classList.remove("is-open");
      if (backdrop) backdrop.classList.remove("is-open");
      hamburger.setAttribute("aria-expanded", "false");
      hamburger.setAttribute("aria-label", "Open menu");
      document.body.classList.remove("nav-open");
    }

    // Force an explicit closed state first, then enable transitions on the
    // next paint to prevent first-render drawer motion.
    closeMenu();
    requestAnimationFrame(() => {
      overlay.classList.add("nav-is-init");
      if (backdrop) backdrop.classList.add("nav-is-init");
    });

    hamburger.addEventListener("click", () => {
      const open = overlay.classList.toggle("is-open");
      if (backdrop) backdrop.classList.toggle("is-open", open);
      hamburger.setAttribute("aria-expanded", String(open));
      hamburger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.classList.toggle("nav-open", open);
    });

    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
    if (backdrop) backdrop.addEventListener("click", closeMenu);

    overlay.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    // Swipe right to close
    let touchStartX = 0;
    let touchStartY = 0;
    overlay.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    overlay.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dx > 60 && dy < 80) closeMenu();
    }, { passive: true });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1200) {
        closeMenu();
      }
    }, { passive: true });
  }

  /* ── Intersection Observer reveals ────────────────────── */
  function initReveal() {
    const els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    els.forEach((el) => observer.observe(el));
  }

  /* ── Stats counter ─────────────────────────────────────── */
  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function animateCounter(el) {
    const target = parseInt(el.dataset.countTarget, 10);
    const suffix = el.dataset.countSuffix || "";
    const duration = 1600;
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.round(easeOutExpo(progress) * target);
      el.textContent = value.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initStats() {
    const counters = document.querySelectorAll("[data-count-target]");
    if (!counters.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            const el = entry.target;
            const item = el.closest(".stat-item");
            let extraDelay = 0;
            if (item) {
              const raw = getComputedStyle(item).getPropertyValue("--reveal-delay").trim();
              extraDelay = parseFloat(raw) || 0;
            }
            // Wait for reveal transition (900ms = --duration-reveal) + item stagger
            setTimeout(() => animateCounter(el), 900 + extraDelay);
          }
        });
      },
      { threshold: 0.1 }
    );

    counters.forEach((el) => observer.observe(el));
  }

  /* ── Value panel sequence ──────────────────────────────── */
  function initValuePanels() {
    const panels = document.querySelectorAll(".value-panel");
    if (!panels.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("is-active", entry.isIntersecting);
        });
      },
      { threshold: 0.6 }
    );

    panels.forEach((p) => observer.observe(p));
  }

  /* ── Back-to-top ───────────────────────────────────────── */
  function initBackToTop() {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;

    window.addEventListener(
      "scroll",
      () => {
        btn.classList.toggle("is-visible", window.scrollY > 300);
      },
      { passive: true }
    );

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ── Hero parallax + fade ──────────────────────────────── */
  function initHeroParallax() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bg = document.querySelector(".hero-bg");
    const hero = document.getElementById("hero");
    if (!bg || !hero) return;

    let raf = null;
    window.addEventListener(
      "scroll",
      function () {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          const y = window.scrollY;
          const h = hero.offsetHeight;
          if (y > h) return;
          // bg moves down at 25% of scroll speed → appears to move up at 75% vs text at 100%
          bg.style.transform = "translateY(" + y * 0.25 + "px)";
          bg.style.opacity = String(Math.max(0, 1 - (y / h) * 1.4));
        });
      },
      { passive: true }
    );
  }

  /* ── GLightbox ─────────────────────────────────────────── */
  function initLightbox() {
    if (typeof GLightbox !== "undefined") {
      GLightbox({ selector: ".portfolio-lightbox" });
    }
  }

  /* ── Theme toggle button ───────────────────────────────── */
  function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", toggleTheme);
  }

  /* ── Page veil fade-in ─────────────────────────────────── */
  function initPageVeil() {
    const veil = document.createElement("div");
    veil.id = "page-veil";
    document.body.prepend(veil);
    // Two rAF frames ensure veil was painted before we start the fade
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        veil.classList.add("is-gone");
      });
    });
  }

  /* ── Word-by-word reveal ───────────────────────────────── */
  function initWordReveal() {
    const els = document.querySelectorAll("[data-word-reveal]:not([data-word-reveal-done])");
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    els.forEach((el) => {
      el.dataset.wordRevealDone = "1";
      // Read base delay from CSS custom property
      const baseDelay = parseFloat(
        getComputedStyle(el).getPropertyValue("--reveal-delay").trim() || "0"
      ) || 0;

      // Walk child nodes: split text nodes into word spans, treat inline elements as atomic units
      let wordIndex = 0;

      function wrapNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const tokens = node.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          tokens.forEach((token) => {
            if (/^\s+$/.test(token) || token === "") {
              frag.appendChild(document.createTextNode(token));
            } else {
              const outer = document.createElement("span");
              outer.className = "word-reveal-wrap";
              const inner = document.createElement("span");
              inner.className = "word-unit";
              inner.style.setProperty("--wi", String(wordIndex));
              inner.style.setProperty("--reveal-delay", baseDelay + "ms");
              inner.textContent = token;
              outer.appendChild(inner);
              frag.appendChild(outer);
              wordIndex++;
            }
          });
          return frag;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Treat inline elements (em, strong, etc.) as atomic word units
          const outer = document.createElement("span");
          outer.className = "word-reveal-wrap";
          const inner = document.createElement("span");
          inner.className = "word-unit";
          inner.style.setProperty("--wi", String(wordIndex));
          inner.style.setProperty("--reveal-delay", baseDelay + "ms");
          inner.appendChild(node.cloneNode(true));
          outer.appendChild(inner);
          wordIndex++;
          return outer;
        }
        return node.cloneNode(true);
      }

      const children = Array.from(el.childNodes);
      el.innerHTML = "";
      children.forEach((child) => {
        el.appendChild(wrapNode(child));
      });

      observer.observe(el);
    });
  }

  /* ── Auto-animate: intelligently apply reveal classes ──── */
  function initAutoAnimate() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function skip(el) {
      // Skip if inside a [data-no-animate] ancestor
      if (el.closest("[data-no-animate]")) return true;
      // Skip if already has .reveal
      if (el.classList.contains("reveal")) return true;
      // Skip if already has data-word-reveal
      if (el.hasAttribute("data-word-reveal")) return true;
      // Skip if inside a container that already has a reveal animation
      // (prevents double-animating children of animated parents, e.g. event-cards inside events-timeline.reveal)
      if (el.parentElement && el.parentElement.closest(".reveal")) return true;
      return false;
    }

    function setDelay(el, index, step, max) {
      const delay = (index % (max || 4)) * step;
      if (delay > 0) el.style.setProperty("--reveal-delay", delay + "ms");
    }

    // h1 outside hero → word reveal
    document.querySelectorAll("h1:not(.hero .hero-headline):not(.hero h1)").forEach((el) => {
      if (skip(el)) return;
      el.setAttribute("data-word-reveal", "");
    });

    // h2 → word reveal
    document.querySelectorAll("h2").forEach((el) => {
      if (skip(el)) return;
      el.setAttribute("data-word-reveal", "");
    });

    // h3 → blur reveal with stagger
    document.querySelectorAll("h3").forEach((el, i) => {
      if (skip(el)) return;
      el.classList.add("reveal", "reveal--blur");
      setDelay(el, i, 40, 6);
    });

    // coach/pbc items → left/right alternate
    document.querySelectorAll(".coach-item, .pbc-item").forEach((el, i) => {
      if (skip(el)) return;
      el.classList.add("reveal", i % 2 === 0 ? "reveal--left" : "reveal--right");
    });

    // group cards → clip reveal with stagger
    document.querySelectorAll(".group-card").forEach((el, i) => {
      if (skip(el)) return;
      el.classList.add("reveal", "reveal--clip");
      setDelay(el, i, 70, 4);
    });

    // tier/value items → rotate reveal with stagger
    document.querySelectorAll(".tier-card, .value-item").forEach((el, i) => {
      if (skip(el)) return;
      el.classList.add("reveal", "reveal--rotate");
      setDelay(el, i, 80, 4);
    });

    // location cards → wave reveal
    document.querySelectorAll(".location-card").forEach((el) => {
      if (skip(el)) return;
      el.classList.add("reveal", "reveal--wave");
    });

    // news items → alternating left/right
    document.querySelectorAll(".news-item").forEach((el, i) => {
      if (skip(el)) return;
      el.classList.add("reveal", i % 2 === 0 ? "reveal--left" : "reveal--right");
    });

    // event cards → clip reveal with stagger
    document.querySelectorAll(".event-card").forEach((el, i) => {
      if (skip(el)) return;
      el.classList.add("reveal", "reveal--clip");
      setDelay(el, i, 60, 4);
    });

    // faq items → scale reveal with stagger
    document.querySelectorAll(".faq-item").forEach((el, i) => {
      if (skip(el)) return;
      el.classList.add("reveal", "reveal--scale");
      setDelay(el, i, 40, 6);
    });

    // body paragraphs not in hero (skip short ones)
    document.querySelectorAll("main p:not(.hero p):not(.hero-tagline)").forEach((el) => {
      if (skip(el)) return;
      if (el.textContent.trim().length < 40) return;
      el.classList.add("reveal", "reveal--up");
    });

    // info/intro cards → wave
    document.querySelectorAll(".info-column, .intro-card").forEach((el) => {
      if (skip(el)) return;
      el.classList.add("reveal", "reveal--wave");
    });

    // stat items → rotate with stagger
    document.querySelectorAll(".stat-item").forEach((el, i) => {
      if (skip(el)) return;
      el.classList.add("reveal", "reveal--rotate");
      setDelay(el, i, 80, 4);
    });

    // Pick up newly added .reveal elements and word reveals
    initReveal();
    initWordReveal();
  }

  /* ── Scroll scrub (parallax + scale + fade) ────────────── */
  function initScrollScrub() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Exclude elements that also have .reveal (transform conflicts with reveal animation)
    const els = Array.from(document.querySelectorAll("[data-scrub]")).filter(
      (el) => !el.classList.contains("reveal")
    );
    if (!els.length) return;

    let raf = null;

    function update() {
      raf = null;
      const vh = window.innerHeight;

      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const progress = Math.min(1, Math.max(0, 1 - center / vh));
        const type = el.dataset.scrub;

        if (type === "parallax-slow") {
          el.style.transform = `translateY(${(progress - 0.5) * -60}px)`;
        } else if (type === "parallax-fast") {
          el.style.transform = `translateY(${(progress - 0.5) * -120}px)`;
        } else if (type === "parallax-bg") {
          el.style.transform = `translateY(${progress * -40}px)`;
        } else if (type === "scale-in") {
          el.style.transform = `scale(${0.88 + progress * 0.12})`;
        } else if (type === "fade-out") {
          el.style.opacity = String(Math.max(0, 1 - progress * 2));
        }
      });
    }

    window.addEventListener("scroll", () => {
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });

    // Initial run
    update();
  }

  /* ── Init on layout:ready ──────────────────────────────── */
  document.addEventListener("layout:ready", () => {
    initPageVeil();
    applyTheme(getTheme());
    initScrollNav();
    initMobileNav();
    initReveal();
    initStats();
    initValuePanels();
    initBackToTop();
    initLightbox();
    initThemeToggle();
    initHeroParallax();
    initAutoAnimate();
    initScrollScrub();
  });

  // Apply theme immediately (before layout:ready) to prevent flash
  applyTheme(getTheme());
})();
