(function () {
  "use strict";

  const includeCache = new Map();
  const loadingIncludePath = "/partials/loading-screen.html";

  function injectCriticalLoadingState() {
    if (document.getElementById("layout-critical-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "layout-critical-style";
    style.textContent = `
      body { margin: 0; overflow: hidden; }
      #content, [data-site-content] { display: none; opacity: 0; }
      #loading-screen {
        position: fixed;
        inset: 0;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      #loading-screen .bouncing-dots {
        display: flex;
        justify-content: space-between;
        width: 80px;
      }
      #loading-screen .dot {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: #eb5d1e;
        animation: layout-loader-bounce 1.4s infinite ease-in-out;
      }
      #loading-screen .dot:nth-child(2) { animation-delay: -0.32s; }
      #loading-screen .dot:nth-child(3) { animation-delay: -0.16s; }
      @keyframes layout-loader-bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-30px); }
        60% { transform: translateY(-15px); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureFallbackLoadingScreen() {
    if (document.getElementById("loading-screen")) {
      return;
    }

    const fallback = document.createElement("div");
    fallback.id = "loading-screen";
    fallback.innerHTML = `
      <div class="bouncing-dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
    document.body.prepend(fallback);
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
      if (includePath === loadingIncludePath && document.getElementById("loading-screen")) {
        el.remove();
        return;
      }

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

    const navLink = document.querySelector(`[data-nav-key="${pageKey}"]`);
    if (!navLink) {
      return;
    }

    navLink.classList.add("active");
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

  injectCriticalLoadingState();
  if (document.body) {
    ensureFallbackLoadingScreen();
  } else {
    document.addEventListener("DOMContentLoaded", ensureFallbackLoadingScreen, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAllIncludes);
  } else {
    loadAllIncludes();
  }
})();
