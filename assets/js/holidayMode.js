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
      document.body.prepend(messageElement);
    }
    messageElement.textContent = holiday.message;

    // Apply holiday theme
    document.body.classList.add('holiday-mode');
    document.body.classList.add(`holiday-${holiday.theme}`);

    // Add holiday-specific elements
    addHolidayElements(holiday.theme);
  }

  function removeHolidayMode() {
    const messageElement = document.getElementById('holiday-message');
    if (messageElement) {
      messageElement.remove();
    }
    document.body.classList.remove('holiday-mode');
    document.body.classList.remove('holiday-christmas', 'holiday-halloween', 'holiday-summer', 'holiday-newyear', 'holiday-valentine');
    removeHolidayElements();
  }

  function addHolidayElements(theme) {
    const container = document.createElement('div');
    container.id = 'holiday-elements';
    container.className = `holiday-${theme}-elements`;
    
    // Add theme-specific elements
    switch(theme) {
      case 'christmas':
        container.innerHTML = '<div class="snowflake">❄</div>'.repeat(10);
        break;
      case 'halloween':
        container.innerHTML = '<div class="pumpkin">🎃</div>'.repeat(5);
        break;
      case 'summer':
        container.innerHTML = '<div class="sun">☀</div><div class="palm-tree">🌴</div>'.repeat(3);
        break;
      case 'newyear':
        container.innerHTML = '<div class="firework">🎆</div>'.repeat(7);
        break;
      case 'valentine':
        container.innerHTML = '<div class="heart">❤</div>'.repeat(10);
        break;
    }
    
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
