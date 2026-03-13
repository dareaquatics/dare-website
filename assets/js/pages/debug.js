function generateDebugIdentifier() {
  const now = new Date();

  const date = now.toISOString().replace(/[:.]/g, "").replace("T", "_").slice(0, 15);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UnknownTZ";
  const platform = (navigator.platform || "UnknownPlatform").replace(/\s+/g, "");
  const screenInfo = `${screen.width}x${screen.height}`;
  const lang = navigator.language || "xx";
  const salt = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `DBG-${date}-${tz.replace(/\//g, "_")}-${platform}-${screenInfo}-${lang}-${salt}`;
}

async function collectBrowserInfo() {
  const info = {};
  const unsupported = [];

  info["User Agent"] = navigator.userAgent;
  info["Platform"] = navigator.platform || "Unavailable";
  info["Language"] = navigator.language || "Unavailable";
  info["Cookies Enabled"] = navigator.cookieEnabled;
  info["Online"] = navigator.onLine;

  info["Screen"] = `${screen.width} x ${screen.height}`;
  info["Available Screen"] = `${screen.availWidth} x ${screen.availHeight}`;
  info["Color Depth"] = screen.colorDepth;

  info["Window Inner"] = `${window.innerWidth} x ${window.innerHeight}`;
  info["Window Outer"] = `${window.outerWidth} x ${window.outerHeight}`;

  info["CPU Cores"] = navigator.hardwareConcurrency || "Unavailable";
  info["Device Memory"] = navigator.deviceMemory
    ? `${navigator.deviceMemory} GB`
    : (unsupported.push("Device Memory API"), "Not Supported");

  info["Timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (navigator.connection) {
    info["Connection Type"] = navigator.connection.effectiveType;
    info["Downlink"] = `${navigator.connection.downlink} Mbps`;
    info["RTT"] = `${navigator.connection.rtt} ms`;
  } else {
    unsupported.push("Network Information API");
    info["Connection"] = "Not Supported";
  }

  if (navigator.storage?.estimate) {
    const storage = await navigator.storage.estimate();
    info["Storage Usage"] = `${(storage.usage / 1024 / 1024).toFixed(2)} MB`;
    info["Storage Quota"] = `${(storage.quota / 1024 / 1024).toFixed(2)} MB`;
  } else {
    unsupported.push("Storage API");
    info["Storage"] = "Not Supported";
  }

  if (navigator.getBattery) {
    const battery = await navigator.getBattery();
    info["Battery Level"] = `${Math.round(battery.level * 100)}%`;
    info["Battery Charging"] = battery.charging ? "Yes" : "No";
  } else {
    unsupported.push("Battery API");
    info["Battery"] = "Not Supported";
  }

  if (navigator.geolocation && confirm("Include approximate location data?")) {
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          info["Latitude"] = pos.coords.latitude;
          info["Longitude"] = pos.coords.longitude;
          info["Accuracy"] = `${pos.coords.accuracy} m`;
          resolve();
        },
        () => {
          info["Geolocation"] = "Denied";
          resolve();
        }
      );
    });
  } else {
    info["Geolocation"] = "Not Included";
  }

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  if (gl) {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    info["GPU Renderer"] = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "Unavailable";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } else {
    unsupported.push("WebGL");
    info["GPU"] = "Not Supported";
  }

  if (navigator.plugins?.length) {
    info["Plugins"] = Array.from(navigator.plugins)
      .map((plugin) => plugin.name)
      .join(", ");
  } else {
    unsupported.push("Plugins API");
    info["Plugins"] = "Unavailable";
  }

  const nav = performance.getEntriesByType("navigation")[0];
  if (nav) {
    info["Page Load Time"] = `${Math.round(nav.loadEventEnd - nav.startTime)} ms`;
    info["DOM Ready"] = `${Math.round(nav.domContentLoadedEventEnd - nav.startTime)} ms`;
  }

  info["Unsupported / Restricted Features"] = unsupported.length ? unsupported.join(", ") : "None Detected";

  document.getElementById("info").textContent = JSON.stringify(info, null, 2);
}

function exportToTxt() {
  const infoText = document.getElementById("info").textContent;
  if (!infoText.trim()) {
    alert("No data collected yet.");
    return;
  }

  const blob = new Blob([infoText], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "browser_debug_info.txt";
  link.click();
}

function copyDebugId() {
  const id = document.getElementById("debug-id").textContent;
  navigator.clipboard.writeText(id).then(() => {
    alert("Debug identifier copied");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("debug-id").textContent = generateDebugIdentifier();

  const collectButton = document.getElementById("collect-info");
  const exportButton = document.getElementById("export-info");
  const copyButton = document.getElementById("copy-debug-id");

  if (collectButton) {
    collectButton.addEventListener("click", collectBrowserInfo);
  }
  if (exportButton) {
    exportButton.addEventListener("click", exportToTxt);
  }
  if (copyButton) {
    copyButton.addEventListener("click", copyDebugId);
  }
});
