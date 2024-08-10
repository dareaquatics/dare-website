(function() {
  function checkHolidayMode() {
    fetch('/holidayMode.json?nocache=' + new Date().getTime())
      .then(response => response.json())
      .then(data => {
        if (data.enabled) {
          const holiday = data.holidays.find(h => h.name === data.currentHoliday) || data;
          applyHolidayMode(holiday);
        } else {
          removeHolidayMode();
        }
      })
      .catch(error => console.error('Error checking holiday mode:', error));
  }

  function applyHolidayMode(holiday) {
    // Add holiday message
    let messageElement = document.getElementById('holiday-message');
    if (!messageElement) {
      messageElement = document.createElement('div');
      messageElement.id = 'holiday-message';
      document.body.appendChild(messageElement);
    }
    messageElement.textContent = holiday.message;

    // Add holiday-specific elements (pumpkins for Halloween)
    if (holiday.theme === 'halloween') {
      addHalloweenElements();
    }
  }

  function removeHolidayMode() {
    const messageElement = document.getElementById('holiday-message');
    if (messageElement) {
      messageElement.remove();
    }
    removeHolidayElements();
  }

  function addHalloweenElements() {
    const container = document.createElement('div');
    container.id = 'holiday-elements';
    container.className = 'holiday-halloween-elements';
    container.innerHTML = '<div class="pumpkin">🎃</div>'.repeat(5);
    document.body.appendChild(container);
  }

  function removeHolidayElements() {
    const container = document.getElementById('holiday-elements');
    if (container) {
      container.remove();
    }
  }

  // Check holiday mode every 5 minutes
  checkHolidayMode();
  setInterval(checkHolidayMode, 5 * 60 * 1000);
})();