document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const adsBlockedCount = document.getElementById('adsBlockedCount');

  // Load saved state
  chrome.storage.local.get(['enabled', 'adsBlocked'], function(result) {
    enableToggle.checked = result.enabled !== false;
    adsBlockedCount.textContent = result.adsBlocked || 0;
  });

  // Save state when toggle is changed
  enableToggle.addEventListener('change', function() {
    chrome.storage.local.set({enabled: enableToggle.checked}, function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "toggleAdBlocker", enabled: enableToggle.checked});
      });
    });
  });

  // Listen for updates to the ads blocked count
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (changes.adsBlocked) {
      adsBlockedCount.textContent = changes.adsBlocked.newValue;
    }
  });
});