// Loading animation removed — content is shown immediately.
(function () {
  function revealContent() {
    const content =
      document.getElementById("content") ||
      document.querySelector("[data-site-content]") ||
      document.querySelector("main");

    if (content) {
      content.style.display = "block";
      content.style.opacity = "1";
    }
    document.body.style.removeProperty("overflow");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", revealContent);
  } else {
    revealContent();
  }
})();
