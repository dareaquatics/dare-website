let indexEffectsInitialized = false;

function initIndexEffects() {
  if (indexEffectsInitialized) return;
  indexEffectsInitialized = true;
  buildPoolSVG();
  initHeroScrollScrub();
  initHeroNav();
  initMissionWordScrub();
  initIndexScrollScrub();
}

document.addEventListener("layout:ready", initIndexEffects);

// Fallback: if layout:ready timing is missed, still initialize on next frame.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(initIndexEffects));
} else {
  requestAnimationFrame(initIndexEffects);
}

// ─── Pool SVG ────────────────────────────────────────────

function buildPoolSVG() {
  const svg = document.getElementById("hero-pool-svg");
  if (!svg) return;

  const NS = "http://www.w3.org/2000/svg";
  const W = 1400, H = 700;
  const mx = 60, my = 55;
  const poolX = mx, poolY = my;
  const poolW = W - mx * 2;  // 1280
  const poolH = H - my * 2;  // 590
  const LANES = 8;
  const laneH = poolH / LANES;  // 73.75

  // Segment dimensions
  const segW = 12, segH = 8, segGap = 8, period = segW + segGap; // 20
  const wireL = 18;  // short wire stub from each wall before floats begin
  const ropeInnerW = poolW - wireL * 2;
  const numSegs = Math.floor(ropeInnerW / period);
  const startX = poolX + wireL + (ropeInnerW - (numSegs * period - segGap)) / 2;

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  // 1. Pool floor
  svg.appendChild(el("rect", {
    x: poolX, y: poolY, width: poolW, height: poolH,
    fill: "var(--pool-floor)"
  }));

  // 2. T-markers per lane (rendered before border so border sits on top)
  const cbW = 6;        // crossbar width (flush with wall)
  const cbH = laneH * 0.55;  // crossbar height
  const stemL = 75;     // stem length (inward)
  const stemH = 5;      // stem height

  for (let i = 0; i < LANES; i++) {
    const laneTop = poolY + i * laneH;
    const laneCY = laneTop + laneH / 2;

    // Left T-marker (⊢): crossbar at x=poolX, stem points right
    const lcbX = poolX;
    const lcbY = laneCY - cbH / 2;
    svg.appendChild(el("rect", {
      x: lcbX, y: lcbY, width: cbW, height: cbH,
      fill: "var(--t-mark)"
    }));
    svg.appendChild(el("rect", {
      x: lcbX + cbW, y: laneCY - stemH / 2,
      width: stemL, height: stemH,
      fill: "var(--t-mark)"
    }));

    // Right T-marker (⊣): crossbar at x=poolX+poolW-cbW, stem points left
    const rcbX = poolX + poolW - cbW;
    svg.appendChild(el("rect", {
      x: rcbX, y: laneCY - cbH / 2, width: cbW, height: cbH,
      fill: "var(--t-mark)"
    }));
    svg.appendChild(el("rect", {
      x: rcbX - stemL, y: laneCY - stemH / 2,
      width: stemL, height: stemH,
      fill: "var(--t-mark)"
    }));
  }

  // 3. Pool border
  svg.appendChild(el("rect", {
    x: poolX, y: poolY, width: poolW, height: poolH,
    fill: "none",
    stroke: "var(--pool-border)",
    "stroke-width": 4
  }));

  // 4. Lane ropes (between lanes 0-1 through 6-7)
  for (let r = 0; r < LANES - 1; r++) {
    const ropeY = poolY + (r + 1) * laneH;
    const segY = ropeY - segH / 2;

    // Wire stubs: short anchor lines from each wall to first/last float
    const wireAttrs = { y1: ropeY, y2: ropeY, stroke: "rgba(180, 200, 220, 0.45)", "stroke-width": 1.5 };
    svg.appendChild(el("line", { ...wireAttrs, x1: poolX, x2: poolX + wireL }));
    svg.appendChild(el("line", { ...wireAttrs, x1: poolX + poolW - wireL, x2: poolX + poolW }));

    // Rope thread (cord behind segments, between the wire stubs)
    svg.appendChild(el("line", {
      x1: poolX + wireL, y1: ropeY, x2: poolX + poolW - wireL, y2: ropeY,
      stroke: "rgba(8, 22, 55, 0.35)",
      "stroke-width": 1.5
    }));

    // Segments wrapped in a group for opacity
    const ropeGroup = el("g", { opacity: "0.55" });
    for (let s = 0; s < numSegs; s++) {
      let fill;
      if (s < 4 || s >= numSegs - 4) {
        fill = "var(--lane-red)";
      } else {
        fill = (s % 2 === 0) ? "var(--lane-navy)" : "var(--lane-white)";
      }
      ropeGroup.appendChild(el("rect", {
        x: startX + s * period,
        y: segY,
        width: segW,
        height: segH,
        rx: 2,
        fill: fill
      }));
    }
    svg.appendChild(ropeGroup);
  }
}

// ─── Hero Nav ────────────────────────────────────────────

function initHeroNav() {
  const header = document.getElementById("header");
  const hero = document.getElementById("hero");
  if (!header || !hero) return;

  function update() {
    const heroH = hero.offsetHeight || window.innerHeight;
    header.dataset.scrolled = window.scrollY >= heroH * 0.5 ? "true" : "false";
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
}

// ─── Hero Scroll Scrub (pool tilt + depth layers) ────────

function initHeroScrollScrub() {
  const poolSvg = document.getElementById("hero-pool-svg");
  const hero = document.getElementById("hero");
  if (!poolSvg || !hero) return;

  const tagline = hero.querySelector(".hero-tagline");
  const eyebrow = hero.querySelector(".hero-eyebrow");
  const scrollIndicator = hero.querySelector(".hero-scroll");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function update() {
    const heroH = hero.offsetHeight || window.innerHeight;

    // Pool rotation: 0 → 75deg over first 65% of hero scroll
    const poolProgress = Math.min(window.scrollY / (heroH * 0.65), 1);
    poolSvg.style.transform = "rotateX(" + (poolProgress * 75) + "deg)";

    if (reducedMotion) return;

    // Tagline: fade + slide over 0→45% of hero
    if (tagline) {
      const p = Math.min(window.scrollY / (heroH * 0.45), 1);
      tagline.style.opacity = 1 - p;
      tagline.style.transform = "translateY(" + (-p * 22) + "px)";
    }

    // Eyebrow: fade over 0→30%
    if (eyebrow) {
      const p = Math.min(window.scrollY / (heroH * 0.30), 1);
      eyebrow.style.opacity = 1 - p;
    }

    // Scroll indicator: fade over 0→25%
    if (scrollIndicator) {
      const p = Math.min(window.scrollY / (heroH * 0.25), 1);
      scrollIndicator.style.opacity = 1 - p;
    }
  }

  window.addEventListener("scroll", update, { passive: true });
  update();
}

// ─── Mission Word Scrub ───────────────────────────────────

function initMissionWordScrub() {
  const section = document.getElementById("mission");
  if (!section) return;

  const missionText = document.getElementById("mission-text");
  if (!missionText) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion) {
    missionText.style.opacity = "1";
    return;
  }

  // Split into word spans
  const rawText = missionText.textContent.trim();
  const words = rawText.split(/\s+/);
  missionText.innerHTML = "";
  words.forEach(function (word, i) {
    const span = document.createElement("span");
    span.className = "mission-word";
    span.textContent = word;
    missionText.appendChild(span);
    if (i < words.length - 1) {
      missionText.appendChild(document.createTextNode(" "));
    }
  });

  // Set initial dim state synchronously (loading screen covers the flash)
  const wordSpans = Array.from(missionText.querySelectorAll(".mission-word"));
  wordSpans.forEach(function (w) {
    w.style.opacity = "0.12";
    w.style.filter = "blur(5px)";
    w.style.transform = "scale(0.86)";
  });

  const N = wordSpans.length;
  let sectionTop = 0;
  let sectionHeight = 0;

  function cacheMetrics() {
    sectionTop = section.offsetTop;
    sectionHeight = section.offsetHeight;
  }
  cacheMetrics();

  function scrub() {
    const vh = window.innerHeight;
    const rawProgress = (window.scrollY - sectionTop) / (sectionHeight - vh);
    const sectionProgress = Math.min(1, Math.max(0, rawProgress));

    wordSpans.forEach(function (word, i) {
      const wordStart = (i / N) * 0.80 + 0.05;
      const wordEnd = wordStart + (0.80 / N) + 0.06;
      const wordProgress = Math.min(1, Math.max(0, (sectionProgress - wordStart) / (wordEnd - wordStart)));

      word.style.opacity = 0.12 + wordProgress * 0.88;
      word.style.filter = "blur(" + ((1 - wordProgress) * 5) + "px)";
      word.style.transform = "scale(" + (0.86 + wordProgress * 0.14) + ")";
    });
  }

  let raf = null;
  window.addEventListener("scroll", function () {
    if (!raf) raf = requestAnimationFrame(function () { raf = null; scrub(); });
  }, { passive: true });

  window.addEventListener("resize", cacheMetrics, { passive: true });

  scrub();
}

// ─── Unified Index Scroll Scrub ───────────────────────────

function initIndexScrollScrub() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Cache element references
  const statsSection = document.getElementById("stats");
  const statNumbers = statsSection ? Array.from(statsSection.querySelectorAll(".stat-number")) : [];

  const valuesSection = document.getElementById("values");
  const valuePanels = valuesSection ? Array.from(valuesSection.querySelectorAll(".value-panel")) : [];

  const groupsSection = document.getElementById("groups-preview");
  const groupCards = groupsSection ? Array.from(groupsSection.querySelectorAll(".group-card-preview")) : [];

  const coachesSection = document.getElementById("coaches-preview");
  const coachCards = coachesSection ? Array.from(coachesSection.querySelectorAll(".coach-card-preview")) : [];

  const gallerySection = document.getElementById("gallery");
  const galleryImgs = gallerySection ? Array.from(gallerySection.querySelectorAll(".portfolio-item img")) : [];

  const ctaSection = document.getElementById("cta");
  const ctaHeading = ctaSection ? ctaSection.querySelector(".cta-heading") : null;
  const ctaSubtext = ctaSection ? ctaSection.querySelector(".cta-subtext") : null;
  const ctaActions = ctaSection ? ctaSection.querySelector(".cta-actions") : null;

  if (reducedMotion) {
    // Restore everything to visible state
    groupCards.forEach(function (el) { el.style.clipPath = "none"; });
    coachCards.forEach(function (el) { el.style.opacity = el.style.transform = ""; });
    valuePanels.forEach(function (el) { el.style.opacity = el.style.transform = ""; });
    statNumbers.forEach(function (el) { el.style.opacity = el.style.transform = ""; });
    galleryImgs.forEach(function (img) { img.style.transform = ""; });
    if (ctaHeading) ctaHeading.style.opacity = "";
    if (ctaSubtext) ctaSubtext.style.opacity = "";
    if (ctaActions) ctaActions.style.opacity = "";
    return;
  }

  // Set initial states synchronously before first paint
  groupCards.forEach(function (el) {
    el.style.clipPath = "inset(100% 0 0 0 round 14px)";
  });
  coachCards.forEach(function (el, i) {
    el.style.opacity = "0.2";
    el.style.transform = "translateX(" + (i % 2 === 0 ? -70 : 70) + "px)";
    el.style.transition = "none";
  });
  valuePanels.forEach(function (el) {
    el.style.opacity = "0.3";
    el.style.transform = "rotateX(20deg) translateY(50px)";
    el.style.transition = "none";
  });
  statNumbers.forEach(function (el) {
    el.style.opacity = "0.2";
    el.style.transform = "scale(0.65)";
  });
  // Gallery imgs: disable CSS transitions during scrub
  galleryImgs.forEach(function (img) {
    img.style.transition = "none";
  });
  // Split CTA heading into word spans for mission-style scrub
  var ctaWordSpans = [];
  if (ctaHeading) {
    var ctaRawText = ctaHeading.textContent.trim();
    var ctaWords = ctaRawText.split(/\s+/);
    ctaHeading.innerHTML = "";
    ctaWords.forEach(function (word, i) {
      var span = document.createElement("span");
      span.className = "cta-word";
      span.style.display = "inline-block";
      span.style.opacity = "0.12";
      span.style.filter = "blur(5px)";
      span.style.transform = "scale(0.86)";
      span.textContent = word;
      ctaHeading.appendChild(span);
      if (i < ctaWords.length - 1) {
        ctaHeading.appendChild(document.createTextNode(" "));
      }
    });
    ctaWordSpans = Array.from(ctaHeading.querySelectorAll(".cta-word"));
  }
  if (ctaSubtext) ctaSubtext.style.opacity = "0.2";
  if (ctaActions) ctaActions.style.opacity = "0.2";

  function clamp(v) { return Math.min(1, Math.max(0, v)); }

  // Viewport-relative progress: 0 when el.top = startVh*vh, 1 when el.top = endVh*vh
  function vp(el, startVh, endVh) {
    const rect = el.getBoundingClientRect();
    const pos = rect.top / window.innerHeight;
    return clamp((startVh - pos) / (startVh - endVh));
  }

  function scrubStats() {
    statNumbers.forEach(function (el, i) {
      const p = vp(el, 0.92 - i * 0.06, 0.28);
      const scale = 0.65 + p * 0.35;
      const opacity = 0.2 + p * 0.8;
      el.style.transform = "scale(" + scale + ")";
      el.style.opacity = opacity;
    });
  }

  function scrubValues() {
    valuePanels.forEach(function (el, i) {
      const row = i < 2 ? 0 : 1;
      const p = vp(el, 0.95 - row * 0.08, 0.50);
      if (p >= 1) {
        el.style.transform = "";
        el.style.opacity = "";
        el.style.transition = "";
      } else {
        el.style.transition = "none";
        el.style.transform = "rotateX(" + ((1 - p) * 20) + "deg) translateY(" + ((1 - p) * 50) + "px)";
        el.style.opacity = 0.3 + p * 0.7;
      }
    });
  }

  function scrubGroups() {
    var mobile = window.innerWidth < 768;
    var stagger = mobile ? 0.02 : 0.05;
    groupCards.forEach(function (el, i) {
      const p = vp(el, 0.98 - i * stagger, 0.65);
      el.style.clipPath = "inset(" + ((1 - p) * 100) + "% 0 0 0 round 14px)";
    });
  }

  function scrubCoaches() {
    coachCards.forEach(function (el, i) {
      var row = Math.floor(i / 3);
      const p = vp(el, 0.98 - row * 0.06, 0.48);
      if (p >= 1) {
        el.style.transform = "";
        el.style.opacity = "";
        el.style.transition = "";
      } else {
        el.style.transition = "none";
        const dir = i % 2 === 0 ? -1 : 1;
        el.style.transform = "translateX(" + ((1 - p) * 70 * dir) + "px)";
        el.style.opacity = 0.2 + p * 0.8;
      }
    });
  }

  function scrubGallery() {
    galleryImgs.forEach(function (img, i) {
      const row = Math.floor(i / 3);
      const p = vp(img, 0.92 - row * 0.14, 0.15);
      if (p >= 1) {
        img.style.transform = "";
        img.style.transition = ""; // restore CSS transition for hover
      } else {
        img.style.transform = "scale(" + (1.18 - p * 0.18) + ")";
      }
    });
  }

  function scrubCta() {
    if (!ctaSection) return;
    const p = vp(ctaSection, 0.95, 0.10);

    // Glow expansion via CSS custom properties
    const glowW = 20 + p * 50;
    const glowH = 25 + p * 55;
    const glowOpacity = 0.02 + p * 0.14;
    ctaSection.style.setProperty("--cta-glow-size", glowW + "% " + glowH + "%");
    ctaSection.style.setProperty("--cta-glow-opacity", glowOpacity.toFixed(3));

    // Word-by-word scrub on CTA heading (same style as mission)
    if (ctaWordSpans.length) {
      var headingP = vp(ctaHeading, 1.0, 0.55);
      var N = ctaWordSpans.length;
      ctaWordSpans.forEach(function (word, i) {
        var wordStart = (i / N) * 0.80 + 0.05;
        var wordEnd = wordStart + (0.80 / N) + 0.06;
        var wp = clamp((headingP - wordStart) / (wordEnd - wordStart));

        if (wp >= 1) {
          word.style.opacity = "";
          word.style.filter = "";
          word.style.transform = "";
          word.style.textShadow = "";
        } else {
          word.style.opacity = 0.12 + wp * 0.88;
          word.style.filter = "blur(" + ((1 - wp) * 5) + "px)";
          word.style.transform = "scale(" + (0.86 + wp * 0.14) + ")";
          word.style.textShadow = "0 0 " + (wp * 52) + "px rgba(235,93,30," + (wp * 0.32) + ")";
        }
      });
    }
    if (ctaSubtext) {
      if (p >= 1) ctaSubtext.style.opacity = "";
      else ctaSubtext.style.opacity = 0.2 + p * 0.8;
    }
    if (ctaActions) {
      if (p >= 1) ctaActions.style.opacity = "";
      else ctaActions.style.opacity = 0.2 + p * 0.8;
    }
  }

  function scrub() {
    scrubStats();
    scrubValues();
    scrubGroups();
    scrubCoaches();
    scrubGallery();
    scrubCta();
  }

  let raf = null;
  window.addEventListener("scroll", function () {
    if (!raf) raf = requestAnimationFrame(function () { raf = null; scrub(); });
  }, { passive: true });

  scrub(); // initial paint
}
