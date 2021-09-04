const Apify = require('apify');
const Puppeteer = require('puppeteer');

const { DEFAULT_TIMEOUT, PLACE_TITLE_SEL, BACK_BUTTON_SEL } = require('./consts');

const { log } = Apify.utils;

/**
 * Wait until google map loader disappear
 * @param {Puppeteer.Page} page
 * @return {Promise<void>}
 */
module.exports.waitForGoogleMapLoader = async (page) => {
    if (await page.$('#searchbox')) {
        // @ts-ignore
        await page.waitForFunction(() => !document.querySelector('#searchbox')
            .classList.contains('loading'), { timeout: DEFAULT_TIMEOUT });
    }
    // 2019-05-19: New progress bar
    await page.waitForFunction(() => !document.querySelector('.loading-pane-section-loading'), { timeout: DEFAULT_TIMEOUT });
};

/** @param {number} float */
module.exports.fixFloatNumber = (float) => Number(float.toFixed(7));

/**
 * Method scrolls page to xpos, ypos.
 * @param {Puppeteer.Page} page
 * @param {string} selectorToScroll
 * @param {number} scrollToHeight
 */
module.exports.scrollTo = async (page, selectorToScroll, scrollToHeight) => {
    try {
        await page.waitForSelector(selectorToScroll);
    } catch (e) {
        log.warning(`Could not find selector ${selectorToScroll} to scroll to - ${page.url()}`);
    }
    await page.evaluate((selector, height) => {
        const scrollable = document.querySelector(selector);
        scrollable.scrollTop = height;
    }, selectorToScroll, scrollToHeight);
};

/** @param {string} url */
module.exports.parseZoomFromUrl = (url) => {
    const zoomMatch = url.match(/@[0-9.-]+,[0-9.-]+,([0-9.]+)z/);
    return zoomMatch ? Number(zoomMatch[1]) : null;
};

/** @param {string[]} imageUrls */
module.exports.enlargeImageUrls = (imageUrls) => {
    // w1920-h1080
    const FULL_RESOLUTION = {
        width: 1920,
        height: 1080,
    };
    return imageUrls.map((imageUrl) => {
        const sizeMatch = imageUrl.match(/=s\d+/);
        const widthHeightMatch = imageUrl.match(/=w\d+-h\d+/);
        if (sizeMatch) {
            return imageUrl.replace(sizeMatch[0], `=s${FULL_RESOLUTION.width}`);
        }
        if (widthHeightMatch) {
            return imageUrl.replace(widthHeightMatch[0], `=w${FULL_RESOLUTION.width}-h${FULL_RESOLUTION.height}`);
        }
        return imageUrl;
    });
};

/**
 * Waits until a predicate (funcion that returns bool) returns true
 *
 * ```
 * let eventFired = false;
 * await waiter(() => eventFired, { timeout: 120000, pollInterval: 1000 })
 * // Something happening elsewhere that will set eventFired to true
 * ```
 *
 * @param {function} predicate
 * @param {object} [options]
 * @param {number} [options.timeout]
 * @param {number} [options.pollInterval]
 * @param {string} [options.timeoutErrorMeesage]
 * @param {string} [options.successMessage]
 */
const waiter = async (predicate, options = {}) => {
    const { timeout = 120000, pollInterval = 1000, timeoutErrorMeesage, successMessage } = options;
    const start = Date.now();
    for (;;) {
        if (await predicate()) {
            if (successMessage) {
                log.info(successMessage);
            }
            return;
        }
        const waitingFor = Date.now() - start;
        if (waitingFor > timeout) {
            throw new Error(timeoutErrorMeesage || `Timeout reached when waiting for predicate for ${waitingFor} ms`);
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
};
module.exports.waiter = waiter;

/**
 * Navigates back to the details page
 *
 * @param {Puppeteer.Page} page
 * @param {string} pageLabel label for the current page for error messages
 */
module.exports.navigateBack = async (page, pageLabel) => {
    const title = await page.$(PLACE_TITLE_SEL);
    if (title) {
        log.info('[PLACE]: We are still on the details page -> no back navigation needed');
        return;
    }
    const backButtonPresent = async () => {
        const backButton = await page.$(BACK_BUTTON_SEL);
        return backButton != null;
    }
    await waiter(backButtonPresent, {
        timeout: 2000,
        pollInterval: 500,
        timeoutErrorMeesage: `Waiting for backButton on ${pageLabel} page ran into a timeout after 2s on URL: ${page.url()}`,
    });
    const navigationSucceeded = async () => {
        const backButton = await page.$(BACK_BUTTON_SEL);
        if (backButton) {
            await backButton.evaluate((backButtonNode) => {
                if (backButtonNode instanceof HTMLElement) {
                    backButtonNode.click();
                }
            });
        }
        const title = await page.$(PLACE_TITLE_SEL);
        if (title) {
            return true;
        }
    }
    await waiter(navigationSucceeded, {
        timeout: 10000,
        pollInterval: 500,
        timeoutErrorMeesage: `Waiting for back navigation on ${pageLabel} page ran into a timeout after 10s on URL: ${page.url()}`,
    });
}

/**
 * @param {Puppeteer.Page} page
 * @param {string} url
 * @param {boolean} persistCookiesPerSession
 * @param {Apify.Session | undefined} session
 */
module.exports.waitAndHandleConsentScreen = async (page, url, persistCookiesPerSession, session) => {
    // TODO: Test if the new consent screen works well!

    const predicate = async (shouldClick = false) => {
        // handling consent page (usually shows up on startup), handles non .com domains
        const consentButton = await page.$('[action^="https://consent.google"] button');
        if (consentButton) {
            if (shouldClick) {
                await Promise.all([
                    page.waitForNavigation({ timeout: 60000 }),
                    consentButton.click()
                ]);
            }
            return true;
        }
        // handling consent frame in maps
        // (this only happens rarely, but still happens)
        for (const frame of page.mainFrame().childFrames()) {
            if (frame.url().match(/consent\.google\.[a-z.]+/)) {
                if (shouldClick) {
                    await frame.click('#introAgreeButton');
                }
                return true;
            }
        }
    };

    /**
     * Puts the CONSENT Cookie into the session
     */
    const updateCookies = async () => {
        if (session) {
            const cookies = await page.cookies(url);
            // Without changing the domain, apify won't find the cookie later.
            // Changing the domain can duplicate cookies in the saved session state, so only the necessary cookie is saved here.
            if (cookies) {
                let consentCookie = cookies.filter(cookie => cookie.name=="CONSENT")[0];
                // overwrite the pending cookie to make sure, we don't set the pending cookie when Apify is fixed
                session.setPuppeteerCookies([{... consentCookie}], "https://www.google.com/");
                if (consentCookie) {
                    consentCookie.domain = "www.google.com"
                }
                session.setPuppeteerCookies([consentCookie], "https://www.google.com/");
            }
        } else {
            log.warning("Session is undefined -> consent screen cookies not saved")
        }
    }

    await waiter(predicate, {
        timeout: 60000,
        pollInterval: 500,
        timeoutErrorMeesage: `Waiting for consent screen timeouted after 60000ms on URL: ${url}`,
        successMessage: `Approved consent screen on URL: ${url}`,
    });
    await predicate(true);
    if (persistCookiesPerSession) {
        await updateCookies();
    }
};