(function () {
  "use strict";

  function markJsEnabled() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("jscheck") === "true") {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    try {
      localStorage.setItem("jsEnabled", "true");
    } catch (error) {
      console.warn("Unable to write jsEnabled flag.", error);
    }
  }

  function initAnalytics() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };

    const gaScript = document.createElement("script");
    gaScript.async = true;
    gaScript.src = "https://www.googletagmanager.com/gtag/js?id=G-QXFQXHX3SN";
    document.head.appendChild(gaScript);

    window.gtag("js", new Date());
    window.gtag("config", "G-QXFQXHX3SN");
  }

  markJsEnabled();
  initAnalytics();
})();
