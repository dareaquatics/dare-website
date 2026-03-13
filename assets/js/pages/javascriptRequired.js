(function () {
  "use strict";

  window.addEventListener("load", function () {
    const params = new URLSearchParams(window.location.search);
    if (params.get("jscheck") === "true") {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }

    try {
      localStorage.setItem("jsEnabled", "true");

      const targetUrl = params.get("target") || "/";
      const authorizedUrls = ["/", "/home", "/dashboard"];

      if (localStorage.getItem("jsEnabled") === "true") {
        if (authorizedUrls.includes(targetUrl)) {
          window.location.href = `${decodeURIComponent(targetUrl)}?jscheck=true`;
          return;
        }
        window.location.href = "/";
        return;
      }
    } catch (error) {
      // Continue to display this page when storage is unavailable.
    }

    const browserId = `${navigator.userAgent} | ${navigator.platform} | Lang:${navigator.language} | Mem:${navigator.deviceMemory || "N/A"}GB | Cores:${navigator.hardwareConcurrency || "N/A"} | TS:${Date.now()}`;
    const browserIdEl = document.getElementById("browser-id");
    if (browserIdEl) {
      browserIdEl.textContent = browserId;
    }
  });
})();
