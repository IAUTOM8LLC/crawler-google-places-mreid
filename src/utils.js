const Apify = require('apify');
const Puppeteer = require('puppeteer'); // eslint-disable-line no-unused-vars
const { DEFAULT_TIMEOUT } = require('./consts');

const { log } = Apify.utils;

/**
 * Store screen from puppeteer page to Apify key-value store
 * @param page - Instance of puppeteer Page class https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page
 * @param [key] - Function stores your screen in Apify key-value store under this key
 * @return {Promise<void>}
 */
const saveScreenshot = async (page, key = 'OUTPUT') => {
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    await Apify.setValue(key, screenshotBuffer, { contentType: 'image/png' });
};

/**
 * Store HTML content of page to Apify key-value store
 * @param page - Instance of puppeteer Page class https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page
 * @param [key] - Function stores your HTML in Apify key-value store under this key
 * @return {Promise<void>}
 */
const saveHTML = async (page, key = 'OUTPUT') => {
    const html = await page.content();
    await Apify.setValue(key, html, { contentType: 'text/html; charset=utf-8' });
};

/**
 * Wait until google map loader disappear
 * @param {Puppeteer.Page} page
 * @return {Promise<void>}
 */
const waitForGoogleMapLoader = async (page) => {
    if (await page.$('#searchbox')) {
        await page.waitForFunction(() => !document.querySelector('#searchbox')
            .classList.contains('loading'), { timeout: DEFAULT_TIMEOUT });
    }
    // 2019-05-19: New progress bar
    await page.waitForFunction(() => !document.querySelector('.loading-pane-section-loading'), { timeout: DEFAULT_TIMEOUT });
};

const stringifyGoogleXrhResponse = (googleResponseString) => {
    return JSON.parse(googleResponseString.replace(')]}\'', ''));
};

/**
 * Response from google xhr is kind a weird. Mix of array of array.
 * This function parse places from the response body.
 * @param responseBodyBuffer
 * @return [place]
 */
const parseSearchPlacesResponseBody = (responseBodyBuffer) => {
    const places = [];
    const jsonString = responseBodyBuffer
        .toString('utf-8')
        .replace('/*""*/', '');
    const jsonObject = JSON.parse(jsonString);
    const magicParamD = stringifyGoogleXrhResponse(jsonObject.d);
    const results = magicParamD[0][1];
    results.forEach((result) => {
        if (result[14]) {
            const place = result[14];
            places.push({ placeId: place[78] });
        }
    });
    return places;
};

/**
 * Response from google xhr is kind a weird. Mix of array of array.
 * This function parse reviews from the response body.
 * @param responseBodyBuffer
 * @return [place]
 */
const parseReviewFromResponseBody = (responseBody) => {
    const reviews = [];
    const stringBody = typeof responseBody === 'string'
        ? responseBody
        : responseBody.toString('utf-8');
    const results = stringifyGoogleXrhResponse(stringBody);
    if (!results || !results[2]) return reviews;
    results[2].forEach((reviewArray) => {
        const reviewData = {
            name: reviewArray[0][1],
            text: reviewArray[3],
            publishAt: reviewArray[1],
            likesCount: reviewArray[15],
            reviewId: reviewArray[10],
            reviewUrl: reviewArray[18],
            reviewerId: reviewArray[6],
            reviewerUrl: reviewArray[0][0],
            reviewerNumberOfReviews: reviewArray[12] && reviewArray[12][1] && reviewArray[12][1][1],
            isLocalGuide: reviewArray[12] && reviewArray[12][1] && Array.isArray(reviewArray[12][1][0]),
        };
        // On some places google shows reviews from other services like booking
        // There isn't stars but rating for this places reviews
        if (reviewArray[4]) {
            reviewData.stars = reviewArray[4];
        }
        // Trip advisor
        if (reviewArray[25]) {
            reviewData.rating = reviewArray[25][1];
        }
        if (reviewArray[5]) {
            reviewData.responseFromOwnerText = reviewArray[5][1];
        }
        reviews.push(reviewData);
    });
    return reviews;
};

/**
 * Method scrolls page to xpos, ypos.
 */
const scrollTo = (page, elementToScroll, scrollToHeight) => page.evaluate((elementToScroll, scrollToHeight) => {
    const scrollable = document.querySelector(elementToScroll);
    scrollable.scrollTop = scrollToHeight;
}, elementToScroll, scrollToHeight);

const parseZoomFromUrl = (url) => {
    const zoomMatch = url.match(/@[0-9.-]+,[0-9.-]+,([0-9.]+)z/);
    return zoomMatch ? Number(zoomMatch[1]) : null;
};

const enlargeImageUrls = (imageUrls) => {
    // w1920-h1080
    const FULL_RESOLUTION = {
        width: 1920,
        height: 1080,
    };
    return imageUrls.map((imageUrl) => {
        const sizeMatch = imageUrl.match(/=s\d+/)
        const widthHeightMatch = imageUrl.match(/=w\d+-h\d+/);
        if (sizeMatch) {
            return imageUrl.replace(sizeMatch[0], `=s${FULL_RESOLUTION.width}`);
        } else if (widthHeightMatch) {
            return imageUrl.replace(widthHeightMatch[0], `=w${FULL_RESOLUTION.width}-h${FULL_RESOLUTION.height}`);
        }
        return imageUrl;
    })
}

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
 * @param {object} options
 * @param {number} options.timeout=120000
 * @param {number} options.pollInterval=1000
 * @param {string} options.timeoutErrorMeesage
 * @param {string} options.successMessage
 */
const waiter = async (predicate, options = {}) => {
    const { timeout = 120000, pollInterval = 1000, timeoutErrorMeesage, successMessage } = options;
    const start = Date.now();
    while (true) {
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

const waitAndHandleConsentFrame = async (page, url) => {
    const predicate = async () => {
        for (const frame of page.mainFrame().childFrames()) {
            if (frame.url().includes('consent.google.com')) {
                await frame.click('#introAgreeButton');
                return true;
            }
        }
    }
    await waiter(predicate, {
        timeout: 60000,
        pollInterval: 500,
        timeoutErrorMeesage: `Waiting for consent screen frame timeouted after 60000ms on URL: ${url}`,
        successMessage: `Aproved consent screen on URL: ${url}`,
    })
}

module.exports = {
    saveScreenshot,
    saveHTML,
    waitForGoogleMapLoader,
    parseSearchPlacesResponseBody,
    parseReviewFromResponseBody,
    scrollTo,
    parseZoomFromUrl,
    enlargeImageUrls,
    waiter,
    waitAndHandleConsentFrame,
};
