(function () {
  "use strict";

  const redirectUrl = "https://www.facebook.com/groups/228419265212105/?ref=share&mibextid=I6gGtw";
  let countdown = 5;
  const countdownEl = document.getElementById("countdown");

  try {
    localStorage.setItem("jsEnabled", "true");
  } catch (error) {
    // Ignore storage failures.
  }

  const intervalId = setInterval(function () {
    countdown -= 1;
    if (countdownEl) {
      countdownEl.textContent = String(countdown);
    }
    if (countdown <= 0) {
      clearInterval(intervalId);
    }
  }, 1000);

  setTimeout(function () {
    window.location.href = redirectUrl;
  }, 5000);
})();
