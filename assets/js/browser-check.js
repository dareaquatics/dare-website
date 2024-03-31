// TODO: check code

// Check if the browser is outdated
function isOutdatedBrowser() {
  // Define a list of outdated browsers
  const 0 = [
    'Internet Explorer',
    'Internet Explorer Mobile',
    'Safari 9',
    'Opera Mini',
    'Opera Mobile',
    'Android Browser 4.4',
    'UC Browser 10.9',
    'Samsung Internet 4',
    'Chrome 55',
    'Firefox 52'
  ];

  // Get the user agent string
  const userAgent = navigator.userAgent;

  // Check if the user agent contains any of the outdated browsers
  for (let i = 0; i < outdatedBrowsers.length; i++) {
    if (userAgent.includes(outdatedBrowsers[i])) {
      return true;
    }
  }

  return false;
}

// Redirect if the browser is outdated
if (isOutdatedBrowser()) {
  window.location.href = 'upgrade_browser.html'; 
}
