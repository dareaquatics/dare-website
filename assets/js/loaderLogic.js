function initLoadingAnimation() {
  const loadingScreens = Array.from(document.querySelectorAll("#loading-screen"));
  const content =
    document.getElementById("content") ||
    document.querySelector("[data-site-content]") ||
    document.querySelector("main");

  function revealContent() {
    if (content) {
      content.style.display = "block";
      requestAnimationFrame(() => {
        content.style.opacity = "1";
      });
    }
    document.body.style.overflow = "auto";
  }

  if (!loadingScreens.length) {
    revealContent();
    return;
  }

  function showContent() {
    loadingScreens.forEach((loadingScreen) => {
      loadingScreen.classList.add("fade-out");
      loadingScreen.style.pointerEvents = "none";
    });

    // Wait for the fade-out transition to finish before removing.
    setTimeout(() => {
      loadingScreens.forEach((loadingScreen) => loadingScreen.remove());
      revealContent();
    }, 1000);
  }

  // Generate a random loading time between 200 ms and 900 ms
  const minLoadingTime = 100; // Minimum loading time
  const maxLoadingTime = 300; // Maximum loading time
  const randomLoadingTime =
    Math.floor(Math.random() * (maxLoadingTime - minLoadingTime + 1)) +
    minLoadingTime;

  // Start the loading process with the random duration
  setTimeout(() => {
    // Ensure the loading animation continues for an additional second after loading
    setTimeout(() => {
      showContent();
    }, 300); // Keep animation for 1 second after loading
  }, randomLoadingTime); // Random loading time between 200 ms and 900 ms
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLoadingAnimation);
} else {
  initLoadingAnimation();
}
