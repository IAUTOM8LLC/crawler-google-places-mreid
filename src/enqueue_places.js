/* eslint-env jquery */
const Apify = require('apify');
const querystring = require('querystring');

const Puppeteer = require('puppeteer'); // eslint-disable-line
const typedefs = require('./typedefs'); // eslint-disable-line no-unused-vars
const Stats = require('./stats'); // eslint-disable-line no-unused-vars
const PlacesCache = require('./places_cache'); // eslint-disable-line no-unused-vars
const MaxCrawledPlacesTracker = require('./max-crawled-places'); // eslint-disable-line no-unused-vars

const { sleep, log } = Apify.utils;
const { PLACE_TITLE_SEL, NEXT_BUTTON_SELECTOR, NO_RESULT_XPATH } = require('./consts');
const { waitForGoogleMapLoader, parseZoomFromUrl } = require('./utils');
const { parseSearchPlacesResponseBody } = require('./extractors');
const { checkInPolygon } = require('./polygon');

const SEARCH_WAIT_TIME_MS = 30000;
const CHECK_LOAD_OUTCOMES_EVERY_MS = 500;

/**
 * This handler waiting for response from xhr and enqueue places from the search response boddy.
 * @param {{
 *   page: Puppeteer.Page,
 *   requestQueue: Apify.RequestQueue,
 *   request: Apify.Request,
 *   searchString: string,
 *   exportPlaceUrls: boolean,
 *   geo: object,
 *   placesCache: PlacesCache,
 *   stats: Stats,
 *   maxCrawledPlacesTracker: MaxCrawledPlacesTracker,
 *   crawler: Apify.PuppeteerCrawler,
 * }} options
 * @return {(response: Puppeteer.Response) => Promise<void>}
 */
const enqueuePlacesFromResponse = (options) => {
    const { page, requestQueue, searchString, request, exportPlaceUrls, geo,
        placesCache, stats, maxCrawledPlacesTracker, crawler } = options;
    return async (response) => {
        const url = response.url();
        if (url.match(/google\.[a-z.]+\/search/)) {
            // Parse page number from request url
            const queryParams = querystring.parse(url.split('?')[1]);
            // @ts-ignore
            const pageNumber = parseInt(queryParams.ech, 10);
            // Parse place ids from response body
            const responseBody = await response.buffer();
            const placesPaginationData = parseSearchPlacesResponseBody(responseBody);
            let index = -1;
            let enqueued = 0;
            // At this point, page URL should be resolved
            const searchPageUrl = page.url();

            for (const placePaginationData of placesPaginationData) {
                index++;
                const rank = ((pageNumber - 1) * 20) + (index + 1);
                if (exportPlaceUrls) {
                    if (!maxCrawledPlacesTracker.canScrapeMore()) {
                        return;
                    }
                    const shouldScrapeMore = maxCrawledPlacesTracker.setScraped();
                    await Apify.pushData({
                        url: `https://www.google.com/maps/search/?api=1&query=${searchString}&query_place_id=${placePaginationData.placeId}`,
                    });
                    if (!shouldScrapeMore) {
                        log.warning(`[SEARCH]: Finishing scraping because we reached maxCrawledPlaces `
                            // + `currently: ${maxCrawledPlacesTracker.enqueuedPerSearch[searchKey]}(for this search)/${maxCrawledPlacesTracker.enqueuedTotal}(total) `
                            + `--- ${searchString} - ${request.url}`);
                        await crawler.autoscaledPool?.abort();
                        return;
                    }
                } else {
                    // TODO: Refactor this once we get rid of the caching
                    const coordinates = placePaginationData.coords || placesCache.getLocation(placePaginationData.placeId);
                    const placeUrl = `https://www.google.com/maps/search/?api=1&query=${searchString}&query_place_id=${placePaginationData.placeId}`;
                    placesCache.addLocation(placePaginationData.placeId, coordinates, searchString);
                    if (!geo || !coordinates || checkInPolygon(geo, coordinates)) {
                        const searchKey = searchString || request.url;
                        if (!maxCrawledPlacesTracker.setEnqueued(searchKey)) {
                            log.warning(`[SEARCH]: Finishing search because we enqueued more than maxCrawledPlaces `
                                + `currently: ${maxCrawledPlacesTracker.enqueuedPerSearch[searchKey]}(for this search)/${maxCrawledPlacesTracker.enqueuedTotal}(total) `
                                + `--- ${searchString} - ${request.url}`);
                            break;
                        }
                        const { wasAlreadyPresent } = await requestQueue.addRequest({
                                url: placeUrl,
                                uniqueKey: placePaginationData.placeId,
                                userData: {
                                    label: 'detail',
                                    searchString,
                                    rank,
                                    searchPageUrl,
                                    coords: placePaginationData.coords,
                                    addressParsed: placePaginationData.addressParsed,
                                    isAdvertisement: placePaginationData.isAdvertisement,
                                },
                            },
                            { forefront: true });
                        if (!wasAlreadyPresent) {
                            enqueued++;
                        } else {
                            log.warning(`Google presented already enqueued place, skipping... --- ${placeUrl}`)
                            maxCrawledPlacesTracker.enqueuedTotal--;
                            maxCrawledPlacesTracker.enqueuedPerSearch[searchKey]--;
                        }
                    } else {
                        stats.outOfPolygonCached();
                        stats.outOfPolygon();
                        stats.addOutOfPolygonPlace({ url: placeUrl, searchPageUrl, coordinates });
                    }
                }
            }
            const numberOfAds = placesPaginationData.filter((item) => item.isAdvertisement).length;
            log.info(`[SEARCH]: Enqueued ${enqueued}/${placesPaginationData.length} places (correct location/total) + ${numberOfAds} ads --- ${page.url()}`)
        }
    };
};


/**
 * Periodically checks if one of the possible search outcomes have happened
 * @param {Puppeteer.Page} page
 * @returns {Promise<typedefs.SearchResultOutcome>} // Typing this would require to list all props all time
 */
const waitForSearchResults = async (page) => {
    const start = Date.now();
    // All possible outcomes should be unique, when outcomes happens, we return it
    for (;;) {
        if (Date.now() - start > SEARCH_WAIT_TIME_MS) {
            return { noOutcomeLoaded: true };
        }
        // These must be contains checks because Google sometimes puts an ID into the selector
        const isBadQuery = await page.$('[class *= "section-bad-query"');
        if (isBadQuery) {
            return { isBadQuery: true };
        }

        const hasNoResults = await page.$x(NO_RESULT_XPATH);
        if (hasNoResults.length > 0) {
            return { hasNoResults: true };
        }

        const isDetailPage = await page.$(PLACE_TITLE_SEL);
        if (isDetailPage) {
            return { isDetailPage: true };
        }

        const isNextPaginationDisabled = await page.$(`${NEXT_BUTTON_SELECTOR}:disabled`);
        if (isNextPaginationDisabled) {
            return { isNextPaginationDisabled: true };
        }

        // This is the happy path
        const hasNextPage = await page.$(NEXT_BUTTON_SELECTOR);
        if (hasNextPage) {
            return { hasNextPage: true };
        }        

        await page.waitForTimeout(CHECK_LOAD_OUTCOMES_EVERY_MS);
    } 
}

/**
 * Method adds places from listing to queue
 * @param {{
 *  page: Puppeteer.Page,
 *  searchString: string,
 *  requestQueue: Apify.RequestQueue,
 *  request: Apify.Request,
 *  helperClasses: typedefs.HelperClasses,
 *  scrapingOptions: typedefs.ScrapingOptions,
 *  crawler: Apify.PuppeteerCrawler,
 * }} options
 */
module.exports.enqueueAllPlaceDetails = async ({
                                          page,
                                          searchString,
                                          requestQueue,
                                          request,
                                          crawler,
                                          scrapingOptions,
                                          helperClasses,
                                      }) => {
    const { geo, maxAutomaticZoomOut, exportPlaceUrls } = scrapingOptions;
    const { stats, placesCache, maxCrawledPlacesTracker } = helperClasses;

    page.on('response', enqueuePlacesFromResponse({
        page,
        requestQueue,
        searchString,
        request,
        exportPlaceUrls,
        geo,
        placesCache,
        stats,
        maxCrawledPlacesTracker,
        crawler,
    }));
    // there is no searchString when startUrls are used
    if (searchString) {
        await page.waitForSelector('#searchboxinput', { timeout: 15000 });
        await page.type('#searchboxinput', searchString);
    }

    await sleep(5000);
    await page.click('#searchbox-searchbutton');
    await sleep(5000);
    await waitForGoogleMapLoader(page);

    const startZoom = /** @type {number} */ (parseZoomFromUrl(page.url()));

    for (;;) {
        const {
            noOutcomeLoaded,
            isBadQuery,
            hasNoResults,
            isDetailPage,
            isNextPaginationDisabled,
            hasNextPage,
        } = await waitForSearchResults(page);

        if (noOutcomeLoaded) {
            throw new Error(`[SEARCH]: Don't recognize the loaded content --- ${searchString}`);
        }

        if (isNextPaginationDisabled) {
            log.warning(`[SEARCH]: Finishing search because there are no more pages --- ${searchString} - ${request.url}`);
            return;
        } else if (isBadQuery) {
            log.warning(`[SEARCH]: Finishing search because this query yields no results --- ${searchString} - ${request.url}`);
            return;
        } else if (hasNoResults) {
            log.warning(`[SEARCH]: Finishing search because it reached an empty page (no more results) --- ${searchString} - ${request.url}`);
            return;
        } else if (isDetailPage) {
            // Direct details are processed in enqueueing so we can finish here
            log.warning(`[SEARCH]: Finishing search because we loaded a single place page directly --- ${searchString} - ${request.url}`);
            return;
        }

        if (!maxCrawledPlacesTracker.canEnqueueMore(searchString || request.url)) {
            // no need to log here because it is logged already in 
            return;
        }

        // If Google auto-zoomes too far, we might want to end the search
        let finishBecauseAutoZoom = false;
        if (typeof maxAutomaticZoomOut === 'number') {
            const actualZoom = /** @type {number} */ (parseZoomFromUrl(page.url()));
            // console.log('ACTUAL ZOOM:', actualZoom, 'STARTED ZOOM:', startZoom);
            const googleZoomedOut = startZoom - actualZoom;
            if (googleZoomedOut > maxAutomaticZoomOut) {
                finishBecauseAutoZoom = true;
            }
        }

        if (finishBecauseAutoZoom) {
            log.warning('[SEARCH]: Finishing search because Google zoomed out '
                + 'further than maxAutomaticZoomOut. Current zoom: '
                + `${parseZoomFromUrl(page.url())} --- ${searchString} - ${request.url}`);
            return;
        }
            
        if (hasNextPage) {
            // NOTE: puppeteer API click() didn't work :|
            await page.evaluate((sel) => $(sel).click(), NEXT_BUTTON_SELECTOR);
            await waitForGoogleMapLoader(page);
        }
    }
};
