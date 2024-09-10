chrome.runtime.onInstalled.addListener(() => {
    console.log("StuubTube Installed");
    chrome.storage.local.set({enabled: true, adsBlocked: 0});
});