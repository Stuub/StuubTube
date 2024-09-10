// Pretty simple script, automating a method I've been using manually for years. Current speeds in V1 are a bit whack, only juuust beating 5 second ads. Will see what i can cook up in the next.  

let isBlockingAd = false;
let isEnabled = true;
let adsBlockedCount = 0;

function waitForElement(selector, context = document, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = context.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver(() => {
            const element = context.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(context, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(`Timeout waiting for ${selector}`);
        }, timeout);
    });
}

async function clickElement(selector, context = document, timeout = 5000) {
    const element = await waitForElement(selector, context, timeout);
    element.click();
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`Clicked element: ${selector}`);
    return element;
}

function findElementByText(text, context = document) {
    const xpath = `//*[text()[normalize-space() = '${text}']]`;
    return document.evaluate(xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

async function waitForIframeLoad(iframeElement) {
    if (iframeElement.contentDocument.readyState === 'complete') {
        return iframeElement.contentDocument;
    }
    return new Promise((resolve) => {
        iframeElement.addEventListener('load', () => resolve(iframeElement.contentDocument), { once: true });
    });
}

async function findAndClickButton(text, context, fallbackSelector) {
    let button = findElementByText(text, context);
    if (button) {
        button.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`Clicked "${text}" button found by text content`);
        return button;
    }

    return await clickElement(fallbackSelector, context, 3000);
}

async function verifyElementClicked(element, verificationFn) {
    const maxAttempts = 3;
    for (let i = 0; i < maxAttempts; i++) {
        element.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        if (await verificationFn()) {
            console.log('Click verified');
            return true;
        }
        console.log(`Click attempt ${i + 1} failed verification, retrying...`);
    }
    console.error('Failed to verify click after multiple attempts');
    return false;
}

async function blockAd() {
    if (isBlockingAd) return;

    isBlockingAd = true;
    try {
        // Step 1: Find and open ad center
        console.log('Opening Ad Center...');
        const adButton = await clickElement('.ytp-ad-button-icon', document, 3000);
        await verifyElementClicked(adButton, () => document.querySelector('iframe#iframe'));

        // Step 2: Find and click "block ad" button within the ad center
        console.log('Accessing Ad Center iframe...');
        const iframeElement = await waitForElement('iframe#iframe', document, 3000);
        const iframeDocument = await waitForIframeLoad(iframeElement);
        
        console.log('Clicking "Block ad" button...');
        const blockAdButton = await findAndClickButton('Block ad', iframeDocument, 'button[aria-label="Block ad"], gm3-text-button[data-aria-label="Block ad"]');
        await verifyElementClicked(blockAdButton, () => findElementByText('CONTINUE', iframeDocument));

        // Step 3: Find and click continue button
        console.log('Clicking "CONTINUE" button...');
        const continueButton = await findAndClickButton('CONTINUE', iframeDocument, 'div[role="button"][jsname="uYM01c"]');
        await verifyElementClicked(continueButton, () => findElementByText('Close', iframeDocument));

        // Step 4: Find and click the close button within ad center
        console.log('Clicking "Close" button within Ad Center...');
        const closeButton = await findAndClickButton('Close', iframeDocument, 'button[aria-label="Close"], button.VfPpkd-Bz112c-LgbsSe');
        await verifyElementClicked(closeButton, () => !document.querySelector('iframe#iframe'));

        console.log('Ad blocking process completed successfully');
        adsBlockedCount++;
        chrome.storage.local.set({adsBlocked: adsBlockedCount});
    } catch (error) {
        console.error('Error in blockAd function:', error);
    } finally {
        isBlockingAd = false;
    }
}

const isAdPlaying = () => document.querySelector('.video-ads.ytp-ad-module') !== null;

const observer = new MutationObserver(() => {
    if (isAdPlaying() && !isBlockingAd && isEnabled) {
        console.log('Ad detected, attempting to block...');
        blockAd();
    }
});

// Load saved state
chrome.storage.local.get(['enabled', 'adsBlocked'], function(result) {
    isEnabled = result.enabled !== false;
    adsBlockedCount = result.adsBlocked || 0;
    if (isEnabled) {
        observer.observe(document.body, { childList: true, subtree: true });
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "toggleAdBlocker") {
        isEnabled = request.enabled;
        if (isEnabled) {
            observer.observe(document.body, { childList: true, subtree: true });
            if (isAdPlaying()) blockAd();
        } else {
            observer.disconnect();
        }
    }
});

// Initial check for ads when the script loads
if (isEnabled && isAdPlaying()) blockAd();