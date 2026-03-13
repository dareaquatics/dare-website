(function () {
  "use strict";

  const redirectUrl = "https://instagram.com/dareaquatics";
  let countdown = 5;
  const countdownEl = document.getElementById("countdown");

  try {
    localStorage.setItem("jsEnabled", "true");
  } catch (error) {
    // Ignore storage failures.
  }

  const intervalId = setInterval(function () {
    if (countdown > 0) {
      countdown -= 1;
      if (countdownEl) {
        countdownEl.textContent = String(countdown);
      }
    } else {
      clearInterval(intervalId);
    }
  }, 1000);

  setTimeout(function () {
    window.location.href = redirectUrl;
  }, 5000);
})();
