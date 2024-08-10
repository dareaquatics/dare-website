(function() {
  let config = {
    refreshInterval: 60000,
    maxDisplayed: 2,
    position: 'top'
  };

  function checkEmergencyAlerts() {
    fetch('/emergencyAlert.json?nocache=' + new Date().getTime())
      .then(response => response.json())
      .then(data => {
        config = { ...config, ...data.config };
        const activeAlerts = data.alerts.filter(alert => isAlertActive(alert));
        displayEmergencyAlerts(activeAlerts);
      })
      .catch(error => console.error('Error checking emergency alerts:', error));
  }

  function isAlertActive(alert) {
    if (!alert.active) return false;
    const now = new Date();
    const startTime = new Date(alert.startTime);
    const endTime = new Date(alert.endTime);
    return alert.active && now >= startTime && now <= endTime;
  }

  function displayEmergencyAlerts(alerts) {
    let container = document.getElementById('emergency-alerts-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'emergency-alerts-container';
      document.body.insertBefore(container, document.body.firstChild);
    }
    container.innerHTML = '';

    alerts.slice(0, config.maxDisplayed).forEach(alert => {
      const alertElement = createAlertElement(alert);
      container.appendChild(alertElement);
    });

    positionAlerts();
  }

  function createAlertElement(alert) {
    const alertElement = document.createElement('div');
    alertElement.className = `emergency-alert alert-${alert.severity}`;
    alertElement.setAttribute('data-alert-id', alert.id);

    const content = document.createElement('div');
    content.className = 'alert-content';
    content.innerHTML = `
      ${alert.icon ? `<span class="alert-icon">${alert.icon}</span>` : ''}
      <span class="alert-message">${alert.message}</span>
    `;
    alertElement.appendChild(content);

    if (alert.link) {
      const link = document.createElement('a');
      link.href = alert.link.url;
      link.textContent = alert.link.text;
      link.className = 'alert-link';
      alertElement.appendChild(link);
    }

    if (alert.dismissible) {
      const dismissButton = document.createElement('button');
      dismissButton.textContent = '×';
      dismissButton.className = 'alert-dismiss';
      dismissButton.onclick = () => dismissAlert(alert.id);
      alertElement.appendChild(dismissButton);
    }

    return alertElement;
  }

  function dismissAlert(alertId) {
    const alertElement = document.querySelector(`.emergency-alert[data-alert-id="${alertId}"]`);
    if (alertElement) {
      alertElement.remove();
      localStorage.setItem(`dismissed-alert-${alertId}`, 'true');
    }
  }

  function positionAlerts() {
    const container = document.getElementById('emergency-alerts-container');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.right = '0';
    container.style.zIndex = '9999';

    if (config.position === 'bottom') {
      container.style.bottom = '0';
      container.style.top = 'auto';
    } else {
      container.style.top = '0';
      container.style.bottom = 'auto';
    }
  }

  // Initial check and set up interval
  checkEmergencyAlerts();
  setInterval(checkEmergencyAlerts, config.refreshInterval);
})();
