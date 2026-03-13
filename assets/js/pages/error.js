(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const retryLink = document.getElementById("retry-link");
    if (!retryLink) {
      return;
    }

    retryLink.addEventListener("click", function (event) {
      event.preventDefault();
      window.location.reload();
    });
  });
})();
