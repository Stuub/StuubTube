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

async function waitForIframeContent(iframeElement, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (iframeElement.contentDocument && iframeElement.contentDocument.body) {
            return iframeElement.contentDocument;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Timeout waiting for iframe content");
}

async function retryOperation(operation, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function blockAd() {
    if (isBlockingAd) return;

    isBlockingAd = true;
    let adCenterOpen = false;
    
    try {
        await retryOperation(async () => {
            // Step 1: Find and open ad center
            console.log('Opening Ad Center...');
            const adButton = await clickElement('.ytp-ad-button-icon', document, 5000);
            
            // Prevent ad center from closing
            const preventClose = () => {
                const closeButton = document.querySelector('button[aria-label="Close"]');
                if (closeButton) {
                    closeButton.style.pointerEvents = 'none';
                }
            };
            
            // Wait for iframe to appear and prevent it from closing
            await new Promise((resolve, reject) => {
                const observer = new MutationObserver(() => {
                    const iframe = document.querySelector('iframe#iframe');
                    if (iframe) {
                        preventClose();
                        adCenterOpen = true;
                        observer.disconnect();
                        resolve();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => reject(new Error("Timeout waiting for iframe")), 5000);
            });

            if (!adCenterOpen) {
                throw new Error("Ad center did not open");
            }

            // Step 2: Find and click "block ad" button within the ad center
            console.log('Accessing Ad Center iframe...');
            const iframeElement = await waitForElement('iframe#iframe', document, 5000);
            const iframeDocument = await waitForIframeContent(iframeElement, 5000);
            
            console.log('Clicking "Block ad" button...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait an extra second for iframe content to stabilize
            const blockAdButton = await findAndClickButton('Block ad', iframeDocument, 'button[aria-label="Block ad"], gm3-text-button[data-aria-label="Block ad"]');
            await verifyElementClicked(blockAdButton, () => findElementByText('CONTINUE', iframeDocument));

            // Step 3: Find and click continue button
            console.log('Clicking "CONTINUE" button...');
            const continueButton = await findAndClickButton('CONTINUE', iframeDocument, 'div[role="button"][jsname="uYM01c"]');
            await verifyElementClicked(continueButton, () => findElementByText('Close', iframeDocument));

            // Step 4: Find and click the close button within ad center
            console.log('Clicking "Close" button within Ad Center...');
            const closeButton = await findAndClickButton('Close', iframeDocument, 'button[aria-label="Close"], button.VfPpkd-Bz112c-LgbsSe');
            
            // Re-enable close button before clicking it
            closeButton.style.pointerEvents = '';
            await verifyElementClicked(closeButton, () => !document.querySelector('iframe#iframe'));
        }, 3, 2000);  // Retry the entire process up to 3 times with a 2-second delay between attempts

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