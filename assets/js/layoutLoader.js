(function () {
  "use strict";

  const includeCache = new Map();
  const CRITICAL_STYLESHEET_PATH = "/assets/css/style.css";
  const CRITICAL_STYLE_SENTINEL = "--nav-height";

  function isCriticalStylesheetLink(link) {
    const href = link.getAttribute("href");
    if (!href) {
      return false;
    }

    try {
      return new URL(href, window.location.href).pathname === CRITICAL_STYLESHEET_PATH;
    } catch (error) {
      return href === CRITICAL_STYLESHEET_PATH || href.endsWith(CRITICAL_STYLESHEET_PATH);
    }
  }

  async function waitForCriticalStyles() {
    const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
    const criticalLink = styleLinks.find(isCriticalStylesheetLink);

    function hasCriticalStylesApplied() {
      const sentinel = getComputedStyle(document.documentElement)
        .getPropertyValue(CRITICAL_STYLE_SENTINEL)
        .trim();
      return sentinel.length > 0;
    }

    if (!criticalLink || hasCriticalStylesApplied()) {
      return;
    }

    await new Promise((resolve) => {
      let done = false;
      let pollId = null;
      let timeoutId = null;

      function finish() {
        if (done) {
          return;
        }
        done = true;
        criticalLink.removeEventListener("load", onDone);
        criticalLink.removeEventListener("error", onDone);
        if (pollId !== null) {
          clearInterval(pollId);
        }
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        resolve();
      }

      function onDone() {
        if (hasCriticalStylesApplied()) {
          finish();
          return;
        }
        requestAnimationFrame(() => {
          if (hasCriticalStylesApplied()) {
            finish();
          }
        });
      }

      criticalLink.addEventListener("load", onDone, { once: true });
      criticalLink.addEventListener("error", onDone, { once: true });

      // Poll for stylesheet application in case the load event has already fired.
      pollId = window.setInterval(() => {
        if (hasCriticalStylesApplied()) {
          finish();
        }
      }, 16);

      // Never deadlock include loading.
      timeoutId = window.setTimeout(finish, 2500);
    });
  }

  async function fetchInclude(path) {
    if (!includeCache.has(path)) {
      includeCache.set(
        path,
        fetch(path, { cache: "no-store" }).then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load include: ${path} (${response.status})`);
          }
          return response.text();
        })
      );
    }
    return includeCache.get(path);
  }

  async function executeScripts(rootElement) {
    const scripts = Array.from(rootElement.querySelectorAll("script"));

    for (const oldScript of scripts) {
      const newScript = document.createElement("script");
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;

      const loadPromise = new Promise((resolve) => {
        if (newScript.src) {
          newScript.onload = resolve;
          newScript.onerror = resolve;
        } else {
          resolve();
        }
      });

      oldScript.replaceWith(newScript);
      await loadPromise;
    }
  }

  async function loadInclude(el) {
    const includePath = el.getAttribute("data-include");
    if (!includePath) {
      return;
    }

    try {
      const html = await fetchInclude(includePath);

      const tagName = el.tagName.toLowerCase();
      if (tagName === "template" || tagName === "script" || tagName === "meta") {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        const fragment = document.createDocumentFragment();
        while (wrapper.firstChild) {
          fragment.appendChild(wrapper.firstChild);
        }
        el.replaceWith(fragment);
        return;
      }

      el.innerHTML = html;
      await executeScripts(el);
    } catch (error) {
      console.error("Include load failed:", error);
      if (el.tagName.toLowerCase() !== "template") {
        el.innerHTML = '<div class="layout-include-error" role="alert">Unable to load part of this page.</div>';
      }
    }
  }

  function setActiveNav() {
    const pageKey = document.body.dataset.page;
    if (!pageKey) {
      return;
    }

    const navLinks = document.querySelectorAll(`[data-nav-key="${pageKey}"]`);
    if (!navLinks.length) {
      return;
    }

    navLinks.forEach(link => link.classList.add("active"));
  }

  async function loadAnnouncementIfNeeded() {
    if (document.body.dataset.announcement !== "true") {
      return;
    }

    const scriptUrls = [
      "https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js",
      "/assets/js/announcement.js",
    ];

    for (const url of scriptUrls) {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = url;
        script.onload = resolve;
        script.onerror = resolve;
        document.body.appendChild(script);
      });
    }
  }

  async function loadPageScriptIfNeeded() {
    const pageScriptMap = {
      home: "/assets/js/pages/index.js",
      faq: "/assets/js/pages/faq.js",
    };

    const pageKey = document.body.dataset.page;
    const pageScript = pageScriptMap[pageKey];
    if (!pageScript) {
      return;
    }

    await new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = pageScript;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
    });
  }

  async function loadAllIncludes() {
    const includeElements = Array.from(document.querySelectorAll("[data-include]"));
    for (const el of includeElements) {
      await loadInclude(el);
    }

    setActiveNav();
    await loadAnnouncementIfNeeded();
    await loadPageScriptIfNeeded();

    document.dispatchEvent(new CustomEvent("layout:ready"));
  }

  async function initLayout() {
    await waitForCriticalStyles();
    await loadAllIncludes();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLayout);
  } else {
    initLayout();
  }
})();
