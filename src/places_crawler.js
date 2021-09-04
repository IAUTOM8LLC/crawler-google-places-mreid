/* eslint-env jquery */
const Apify = require('apify');
const Puppeteer = require('puppeteer'); // eslint-disable-line no-unused-vars
const Globalize = require('globalize');

const { extractPageData, extractPopularTimes, extractOpeningHours, extractPeopleAlsoSearch,
    extractAdditionalInfo, extractReviews, extractImages } = require('./extractors');
const { DEFAULT_TIMEOUT, PLACE_TITLE_SEL } = require('./consts');
const { enqueueAllPlaceDetails } = require('./enqueue_places_crawler');
const {
    saveHTML, saveScreenshot, waitForGoogleMapLoader, waitAndHandleConsentFrame, waiter,
} = require('./utils');
const { checkInPolygon } = require('./polygon');

const { log } = Apify.utils;
const { injectJQuery, blockRequests } = Apify.utils.puppeteer;

// TODO: Figure out what this is doing
const DEFAULT_CRAWLER_LOCALIZATION = ['en', 'cs', 'es'];

Globalize.load(require('cldr-data').entireSupplemental());
Globalize.load(require('cldr-data').entireMainFor(...DEFAULT_CRAWLER_LOCALIZATION));

/**
 * This is the worst part - parsing data from place detail
 * @param {{
 *  page: Puppeteer.Page,
 *  request: Apify.Request,
 *  searchString: string,
 *  includeHistogram: boolean,
 *  includeOpeningHours: boolean,
 *  includePeopleAlsoSearch: boolean,
 *  maxReviews: number,
 *  maxImages: number,
 *  additionalInfo: boolean,
 *  geo: any,
 *  cachePlaces: boolean,
 *  allPlaces: {[index: string]: any},
 *  reviewsSort: string,
 *  session: Apify.Session,
 * }} options
 */
const extractPlaceDetail = async (options) => {
    const {
        page, request, searchString, includeHistogram, includeOpeningHours,
        includePeopleAlsoSearch, maxReviews, maxImages, additionalInfo, geo, cachePlaces, allPlaces, reviewsSort,
        session,
    } = options;
    // Extract basic information
    await waitForGoogleMapLoader(page);

    try {
        await page.waitForSelector(PLACE_TITLE_SEL, { timeout: DEFAULT_TIMEOUT });
    } catch (e) {
        session.markBad();
        throw 'The page didn\'t load fast enough, this will be retried';
    }

    const pageData = await extractPageData({ page });

    // Extract gps from URL
    // We need to URL will be change, it happened asynchronously
    await page.waitForFunction(() => window.location.href.includes('/place/'));
    const url = page.url();

    const locationMatch = url.match(/!3d([0-9\-.]+)!4d([0-9\-.]+)/);
    const latMatch = locationMatch ? locationMatch[1] : null;
    const lngMatch = locationMatch ? locationMatch[2] : null;

    const location = latMatch && lngMatch ? { lat: parseFloat(latMatch), lng: parseFloat(lngMatch) } : null

    // check if place is inside of polygon, if not return null, geo non-null only for country/state/city/postal
    if (geo && location && !checkInPolygon(geo, location)) {
        // cache place location to keyVal store
        if (cachePlaces) {
            allPlaces[request.uniqueKey] = location;
        }
        return null;
    }

    // Add info from listing page
    const { userData } = request;

    const detail = {
        ...pageData,
        shownAsAd: userData.shownAsAd,
        rank: userData.rank,
        placeId: request.uniqueKey,
        url,
        searchString,
        location,
        scrapedAt: new Date().toISOString(),
        ...includeHistogram ? await extractPopularTimes({ page }) : {},
        openingHours: includeOpeningHours ? await extractOpeningHours({ page }) : undefined,
        peopleAlsoSearch: includePeopleAlsoSearch ? await extractPeopleAlsoSearch({ page }) : undefined,
        additionalInfo: additionalInfo ? await extractAdditionalInfo({ page }) : undefined,
        ...await extractReviews({ page, totalScore: pageData.totalScore, maxReviews, reviewsSort }),
        imageUrls: await extractImages({ page, maxImages })
    };

    return detail;
};

const setUpCrawler = (crawlerOptions, scrapingOptions, stats, allPlaces) => {
    const {
        includeHistogram, includeOpeningHours, includePeopleAlsoSearch,
        maxReviews, maxImages, exportPlaceUrls, additionalInfo, maxCrawledPlaces,
        maxAutomaticZoomOut, cachePlaces, reviewsSort, language, multiplier, geo,
    } = scrapingOptions;
    const { requestQueue } = crawlerOptions;
    return new Apify.PuppeteerCrawler({
        ...crawlerOptions,
        gotoFunction: async ({ request, page }) => {
            await page._client.send('Emulation.clearDeviceMetricsOverride');
            // This blocks images so we have to skip it
            if (!maxImages) {
                await blockRequests(page, {
                    urlPatterns: ['/maps/vt/', '/earth/BulkMetadata/', 'googleusercontent.com'],
                });
            }
            const mapUrl = new URL(request.url);

            if (language) {
                mapUrl.searchParams.set('hl', language);
            }

            request.url = mapUrl.toString();

            await page.setViewport({ width: 800, height: 800 });

            // Handle consent screen, it takes time before the iframe loads so we need to update userData
            // and block handlePageFunction from continuing until we click on that
            page.on('response', async (res) => {
                if (res.url().includes('consent.google.com/intro')) {
                    request.userData.waitingForConsent = true;
                    await page.waitForTimeout(5000);
                    await waitAndHandleConsentFrame(page, request.url);
                    request.userData.waitingForConsent = false;
                }
            })
            const result = await page.goto(request.url, { timeout: crawlerOptions.pageLoadTimeoutSec * 1000 });

            return result;
        },
        handlePageFunction: async ({ request, page, puppeteerPool, session, autoscaledPool }) => {
            const { label, searchString } = request.userData;

            await injectJQuery(page);

            const logLabel = label === 'startUrl' ? 'SEARCH' : 'PLACE';

            // Handle consent screen, this wait is ok because we wait for selector later anyway
            await page.waitForTimeout(5000);
            if (request.userData.waitingForConsent !== undefined) {
                await waiter(() => request.userData.waitingForConsent === false);
            }

            try {
                // Check if Google shows captcha
                if (await page.$('form#captcha-form')) {
                    throw `[${logLabel}]: Got CAPTCHA on page, retrying --- ${searchString || ''} ${request.url}`;
                }
                if (label === 'startUrl') {
                    log.info(`[${logLabel}]: Start enqueuing places details for search --- ${searchString || ''} ${request.url}`);
                    await enqueueAllPlaceDetails({
                        page,
                        searchString,
                        requestQueue,
                        maxCrawledPlaces,
                        request,
                        exportPlaceUrls,
                        geo,
                        maxAutomaticZoomOut,
                        allPlaces,
                        cachePlaces,
                        stats,
                    });
                    log.info(`[${logLabel}]: Enqueuing places finished for --- ${searchString || ''} ${request.url}`);
                    stats.maps();
                } else {
                    // Get data for place and save it to dataset
                    log.info(`[${logLabel}]: Extracting details from place url ${page.url()}`);
                    const placeDetail = await extractPlaceDetail({
                        page,
                        request,
                        searchString,
                        includeHistogram,
                        includeOpeningHours,
                        includePeopleAlsoSearch,
                        maxReviews,
                        maxImages,
                        additionalInfo,
                        geo,
                        cachePlaces,
                        allPlaces,
                        reviewsSort,
                        session,
                    });
                    if (placeDetail) {
                        await Apify.pushData(placeDetail);
                        // when using polygon search multiple start urls are used. Therefore more links are added to request queue,
                        // there is also good possibility that some of places will be out of desired polygon, so we do not check number of queued places,
                        // only number of places with correct geolocation
                        if (maxCrawledPlaces && maxCrawledPlaces !== 0) {
                            const dataset = await Apify.openDataset();
                            const { cleanItemCount } = await dataset.getInfo();
                            if (cleanItemCount >= maxCrawledPlaces * multiplier) {
                                await autoscaledPool.abort();
                            }
                        }
                        stats.places();
                        log.info(`[${logLabel}]: Place scraped successfully --- ${placeDetail.url}`);
                    } else {
                        stats.outOfPolygon();
                        log.warning(`[${logLabel}]: Place is outside of required location (polygon), skipping... url --- ${page.url()}`);
                    }
                }
                stats.ok();
            } catch (err) {
                // This issue can happen, mostly because proxy IP was blocked by google
                // Let's refresh IP using browser refresh.
                if (log.getLevel() === log.LEVELS.DEBUG) {
                    await saveHTML(page, `${label}-${request.id}.html`);
                    await saveScreenshot(page, `${label}-${request.id}.png`);
                }
                await puppeteerPool.retire(page.browser());
                if (request.retryCount < crawlerOptions.maxRequestRetries && log.getLevel() !== log.LEVELS.DEBUG) {
                    // This fix to not show stack trace in log for retired requests, but we should handle this on SDK
                    const info = 'Stack trace was omitted for retires requests. Set up debug mode to see it.';
                    throw `[${logLabel}]: ${err.message} (${info})`;
                }
                throw err;
            }
        },
        handleFailedRequestFunction: async ({ request, error }) => {
            // This function is called when crawling of a request failed too many time
            stats.failed();
            const defaultStore = await Apify.openKeyValueStore();
            await Apify.pushData({
                '#url': request.url,
                '#succeeded': false,
                '#errors': request.errorMessages,
                '#debugInfo': Apify.utils.createRequestDebugInfo(request),
                '#debugFiles': {
                    html: defaultStore.getPublicUrl(`${request.id}.html`),
                    screen: defaultStore.getPublicUrl(`${request.id}.png`),
                },
            });
            log.exception(error, `Page ${request.url} failed ${request.retryCount + 1} times! It will not be retired. Check debug fields in dataset to find the issue.`);
        },
    });
};

module.exports = { setUpCrawler };
