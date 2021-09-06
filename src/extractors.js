/* eslint-env jquery */
const Apify = require('apify');
const Puppeteer = require('puppeteer'); // eslint-disable-line

const {Review, PersonalDataOptions, PlacePaginationData} = require('./typedefs');

const { PLACE_TITLE_SEL } = require('./consts');
const { waitForGoogleMapLoader, fixFloatNumber, enlargeImageUrls, navigateBack } = require('./utils');
const infiniteScroll = require('./infinite_scroll');

const { log, sleep } = Apify.utils;

/**
 * TODO: There is much of this data in the JSON
 * @param {any} placeData
 * @param {boolean} isAdvertisement
*/
const parseJsonResult = (placeData, isAdvertisement) => {
    if (!placeData) {
        return;
    }
    // Some places don't have any address
    const addressDetail = placeData[183]?.[1];
    const addressParsed = {
        neighborhood: addressDetail?.[1],
        street: addressDetail?.[2],
        city: addressDetail?.[3],
        postalCode: addressDetail?.[4],
        state: addressDetail?.[5],
        countryCode: addressDetail?.[6],
    };

    const coordsArr = placeData[9];
    // TODO: Very rarely place[9] is empty, figure out why
    const coords = coordsArr
        ? { lat: fixFloatNumber(coordsArr[2]), lng: fixFloatNumber(coordsArr[3]) }
        : { lat: null, lng: null };

    return {
        placeId: placeData[78],
        coords,
        addressParsed,
        isAdvertisement,
    };
}

/**
 * Response from google xhr is kind a weird. Mix of array of array.
 * This function parse places from the response body.
 * @param {Buffer} responseBodyBuffer
 * @return {PlacePaginationData[]}
 */
 module.exports.parseSearchPlacesResponseBody = (responseBodyBuffer) => {
    /** @type {PlacePaginationData[]} */
    const placePaginationData = [];
    const jsonString = responseBodyBuffer
        .toString('utf-8')
        .replace('/*""*/', '');
    const jsonObject = JSON.parse(jsonString);
    const data = stringifyGoogleXrhResponse(jsonObject.d);

    // We are paring ads but seems Google is not showing them to the scraper right now
    const ads = (data[2] && data[2][1] && data[2][1][0]) || [];

    ads.forEach((/** @type {any} */ ad) => {
        const placeData = parseJsonResult(ad[15], true);
        if (placeData) {
            placePaginationData.push(placeData);
        } else {
            log.warning(`[SEARCH]: Cannot find place data for advertisement in search.`)
        }
    })

    /** @type {any} Too complex to type out*/
    let organicResults = data[0][1];
    // If the search goes to search results, the first one is not a place
    // If the search goes to a place directly, the first one is that place
    if (organicResults.length > 1) {
        organicResults = organicResults.slice(1)
    }
    organicResults.forEach((/** @type {any} */ result ) => {
        const placeData = parseJsonResult(result[14], false);
        if (placeData) {
            placePaginationData.push(placeData);
        } else {
            log.warning(`[SEARCH]: Cannot find place data in search.`)
        }
    });
    return placePaginationData;
};

/**
 * Parses review from a single review array json Google format
 * @param {any} jsonArray
 * @param {string} reviewsTranslation
 * @return {Review}
 */
 const parseReviewFromJson = (jsonArray, reviewsTranslation) => {
    let text = jsonArray[3];

    // Optionally remove translation
    // TODO: Perhaps the text is differentiated in the JSON
    if (typeof text === 'string' && reviewsTranslation !== 'originalAndTranslated') {
        const splitReviewText = text.split('\n\n(Original)\n');

        if (reviewsTranslation === 'onlyOriginal') {
            // Fallback if there is no translation
            text = splitReviewText[1] || splitReviewText[0];
        } else if (reviewsTranslation === 'onlyTranslated') {
            text = splitReviewText[0];
        }
        text = text.replace('(Translated by Google)', '').replace('\n\n(Original)\n', '').trim();
    }

    return {
        name: jsonArray[0][1],
        text,
        publishAt: jsonArray[1],
        publishedAtDate: new Date(jsonArray[27]).toISOString(),
        likesCount: jsonArray[16],
        reviewId: jsonArray[10],
        reviewUrl: jsonArray[18],
        reviewerId: jsonArray[6],
        reviewerUrl: jsonArray[0][0],
        reviewerNumberOfReviews: jsonArray[12] && jsonArray[12][1] && jsonArray[12][1][1],
        isLocalGuide: jsonArray[12] && jsonArray[12][1] && Array.isArray(jsonArray[12][1][0]),
        // On some places google shows reviews from other services like booking
        // There isn't stars but rating for this places reviews
        stars: jsonArray[4] || null,
        // Trip advisor
        rating: jsonArray[25] ? jsonArray[25][1] : null,
        responseFromOwnerDate: jsonArray[9] && jsonArray[9][3]
            ? new Date(jsonArray[9][3]).toISOString()
            : null,
        responseFromOwnerText: jsonArray[9] ? jsonArray[9][1] : null,
    };
}

/** @param {string} googleResponseString */
const stringifyGoogleXrhResponse = (googleResponseString) => {
    return JSON.parse(googleResponseString.replace(')]}\'', ''));
};

/**
 * Response from google xhr is kind a weird. Mix of array of array.
 * This function parse reviews from the response body.
 * @param {Buffer | string} responseBody
 * @param {string} reviewsTranslation
 * @return [place]
 */
const parseReviewFromResponseBody = (responseBody, reviewsTranslation) => {
    /** @type {Review[]} */
    const currentReviews = [];
    const stringBody = typeof responseBody === 'string'
        ? responseBody
        : responseBody.toString('utf-8');
    let results;
    try {
        results = stringifyGoogleXrhResponse(stringBody);
    } catch (e) {
        return { error: e.message };
    }
    if (!results || !results[2]) {
        return { currentReviews };
    }
    results[2].forEach((/** @type {any} */ jsonArray) => {
        const review = parseReviewFromJson(jsonArray, reviewsTranslation);
        currentReviews.push(review);
    });
    return { currentReviews };
};

/**
 * We combine page and rich JSON data
 * @param {{
 *    page: Puppeteer.Page,
 *    jsonData: any,
 * }} options
 */
module.exports.extractPageData = async ({ page, jsonData }) => {
    let source = await page.content();

    console.log('page===========',source, page, jsonData)
    const jsonResult = parseJsonResult(jsonData, false);
    return page.evaluate((placeTitleSel, addressParsed) => {
        const address = $('[data-section-id="ad"] .section-info-line').text().trim();
        const addressAlt = $("button[data-tooltip*='address']").text().trim();
        const addressAlt2 = $("button[data-item-id*='address']").text().trim();
        const secondaryAddressLine = $('[data-section-id="ad"] .section-info-secondary-text').text().replace('Located in:', '').trim();
        const secondaryAddressLineAlt = $("button[data-tooltip*='locatedin']").text().replace('Located in:', '').trim();
        const secondaryAddressLineAlt2 = $("button[data-item-id*='locatedin']").text().replace('Located in:', '').trim();
        const phone = $('[data-section-id="pn0"].section-info-speak-numeral').length
            // @ts-ignore
            ? $('[data-section-id="pn0"].section-info-speak-numeral').attr('data-href').replace('tel:', '')
            : $("button[data-tooltip*='phone']").text().trim();
        const phoneAlt = $('button[data-item-id*=phone]').text().trim();
        let temporarilyClosed = false;
        let permanentlyClosed = false;
        const altOpeningHoursText = $('[class*="section-info-hour-text"] [class*="section-info-text"]').text().trim();
        if (altOpeningHoursText === 'Temporarily closed') temporarilyClosed = true;
        else if (altOpeningHoursText === 'Permanently closed') permanentlyClosed = true;
        

        return {
            title: $(placeTitleSel).text().trim(),
            subTitle: $('section-hero-header-title-subtitle').first().text().trim() || null,
            // Getting from JSON now
            // totalScore: $('span.section-star-display').eq(0).text().trim(),
            categoryName: $('[jsaction="pane.rating.category"]').text().trim(),
            address: address || addressAlt || addressAlt2 || null,
            locatedIn: secondaryAddressLine || secondaryAddressLineAlt || secondaryAddressLineAlt2 || null,
            ...addressParsed,
            plusCode: $('[data-section-id="ol"] .widget-pane-link').text().trim()
                || $("button[data-tooltip*='plus code']").text().trim()
                || $("button[data-item-id*='oloc']").text().trim() || null,
            website: $('[data-section-id="ap"]').length
                ? $('[data-section-id="ap"]').eq(0).text().trim()
                : $("button[data-tooltip*='website']").text().trim()
                || $("button[data-item-id*='authority']").text().trim() || null,
            phone: phone || phoneAlt || null,
            temporarilyClosed,
            permanentlyClosed,
        };
    }, PLACE_TITLE_SEL, jsonResult?.addressParsed || {});
};

/**
 * @param {{
 *    page: Puppeteer.Page
 * }} options
 */
module.exports.extractPopularTimes = async ({ page }) => {
    const output = {};
    // Include live popular times value
    const popularTimesLiveRawValue = await page.evaluate(() => {
        return $('.section-popular-times-live-value').attr('aria-label');
    });
    const popularTimesLiveRawText = await page.evaluate(() => $('.section-popular-times-live-description').text().trim());
    output.popularTimesLiveText = popularTimesLiveRawText;
    const popularTimesLivePercentMatch = popularTimesLiveRawValue ? popularTimesLiveRawValue.match(/(\d+)\s?%/) : null;
    output.popularTimesLivePercent = popularTimesLivePercentMatch ? Number(popularTimesLivePercentMatch[1]) : null;

    const histogramSel = '.section-popular-times';
    if (await page.$(histogramSel)) {
        output.popularTimesHistogram = await page.evaluate(() => {
            /** @type {{[key: string]: any[]}} */
            const graphs = {};
            const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
            // Extract all days graphs
            $('.section-popular-times-graph').each(function (i) {
                const day = days[i];
                graphs[day] = [];

                /** @type {number | undefined} */
                let graphStartFromHour;

                // Finds where x axis starts
                $(this).find('.section-popular-times-label').each(function (labelIndex) {
                    if (graphStartFromHour) return;
                    const hourText = $(this).text().trim();
                    graphStartFromHour = hourText.includes('p')
                        ? 12 + (parseInt(hourText, 10) - labelIndex)
                        : parseInt(hourText, 10) - labelIndex;
                });
                // Finds values from y axis
                $(this).find('.section-popular-times-bar').each(function (barIndex) {
                    // @ts-ignore
                    const occupancyMatch = $(this).attr('aria-label').match(/\d+(\s+)?%/);
                    if (occupancyMatch && occupancyMatch.length) {
                        // @ts-ignore
                        const maybeHour = graphStartFromHour + barIndex;
                        graphs[day].push({
                            hour: maybeHour > 24 ? maybeHour - 24 : maybeHour,
                            occupancyPercent: parseInt(occupancyMatch[0], 10),
                        });
                    }
                });
            });
            return graphs;
        });
    }
    return output;
};

/**
 * @param {{
 *    page: Puppeteer.Page
 * }} options
 */
module.exports.extractOpeningHours = async ({ page }) => {
    let result;
    const openingHoursSel = '.section-open-hours-container.section-open-hours-container-hoverable';
    const openingHoursSelAlt = '.section-open-hours-container.section-open-hours';
    const openingHoursSelAlt2 = '.section-open-hours-container';
    const openingHoursSelAlt3 = '[jsaction*=openhours]+[class*=open]';
    const openingHoursEl = (await page.$(openingHoursSel))
        || (await page.$(openingHoursSelAlt))
        || (await page.$(openingHoursSelAlt2))
        || (await page.$(openingHoursSelAlt3));
    if (openingHoursEl) {
        const openingHoursText = await page.evaluate((openingHoursElem) => {
            return openingHoursElem.getAttribute('aria-label');
        }, openingHoursEl);

        /** @type {string[]} */
        const openingHours = openingHoursText.split(openingHoursText.includes(';') ? ';' : ',');
        if (openingHours.length) {
            result = openingHours.map((line) => {
                const regexpResult = line.trim().match(/(\S+)\s(.*)/);
                if (regexpResult) {
                    // eslint-disable-next-line prefer-const
                    let [, day, hours] = regexpResult;
                    ([hours] = hours.split('.'));
                    return { day, hours };
                }
                log.debug(`[PLACE]: Not able to parse opening hours: ${line}`);
            });
        }
    }
    return result;
};

/**
 * @param {{
 *    page: Puppeteer.Page
 * }} options
 */
module.exports.extractPeopleAlsoSearch = async ({ page }) => {
    const result = [];
    const peopleSearchContainer = await page.$('.section-carousel-scroll-container');
    if (peopleSearchContainer) {
        const cardSel = 'button[class$="card"]';
        const cards = await peopleSearchContainer.$$(cardSel);
        for (let i = 0; i < cards.length; i++) {
            const searchResult = await page.evaluate((index, sel) => {
                const card = $(sel).eq(index);
                return {
                    title: card.find('div[class$="title"]').text().trim(),
                    totalScore: card.find('span[class$="rating"]').text().trim(),
                };
            }, i, cardSel);
            // For some reason, puppeteer click doesn't work here
            await Promise.all([
                page.evaluate((button, index) => {
                    $(button).eq(index).click();
                }, cardSel, i),
                page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle2'] }),
            ]);
            // @ts-ignore
            searchResult.url = await page.url();
            result.push(searchResult);
            await Promise.all([
                page.goBack({ waitUntil: ['domcontentloaded', 'networkidle2'] }),
                waitForGoogleMapLoader(page),
            ]);
        }
    }
    return result;
};

/**
 * @param {{
 *    page: Puppeteer.Page
 * }} options
 */
module.exports.extractAdditionalInfo = async ({ page }) => {
    let result;
    log.debug('[PLACE]: Scraping additional info.');
    await page.waitForSelector('button[jsaction*="pane.attributes.expand"]', { timeout: 5000 }).catch(() => {});
    const button = await page.$('button[jsaction*="pane.attributes.expand"]');
    if (button) {
        try {
            await button.click({ delay: 200 });
            await page.waitForSelector(PLACE_TITLE_SEL, { timeout: 30000, hidden: true });
            result = await page.evaluate(() => {
                /** @type {{[key: string]: any[]}} */
                const innerResult = {};
                $('div[role="region"]').each((_, section) => {
                    const key = $(section).find('div[class*="subtitle"]').text().trim();
                    /** @type {{[key: string]: boolean}[]} */
                    const values = [];
                    $(section).find('div[aria-label]').each((_i, sub) => {
                        /** @type {{[key: string]: boolean}} */
                        const res = {};
                        const title = $(sub).text().trim();
                        const isChecked = $(sub).find('img[src*=check_black]').length > 0;

                        // @ts-ignore
                        res[title] = isChecked;
                        values.push(res);
                    });
                    innerResult[key] = values;
                });
                return innerResult;
            });
        } catch (e) {
            log.info(`[PLACE]: ${e}Additional info not parsed`);
        } finally {
            await navigateBack(page, 'additional info');
        }
    } else {
        const hotel_avail_amenities = await page.$$eval('div:not([aria-disabled=true]) > span.hotel-amenity-name',
            (elements) => {
                return elements.map((element) => {
                    return element.textContent ? element.textContent.trim() : ''
                });
            }
        );
        const hotel_disabled_amenities = await page.$$eval('div[aria-disabled=true] > span.hotel-amenity-name',
            (elements) => {
                return elements.map((element) => {
                    return element.textContent ? element.textContent.trim() : ''
                });
            }
        );
        if (hotel_avail_amenities.length > 0) {
            const values = [];
            for (let name of hotel_avail_amenities) {
                values.push({[name]: true})
            }
            for (let name of hotel_disabled_amenities) {
                values.push({[name]: false})
            }
            return { "Amenities": values };
        } else {
            log.warning(`Didn't find additional data, skipping - ${page.url()}`);
        }
    }
    return result;
};

/**
 *
 * @param {Review[]} reviews
 * @param {PersonalDataOptions} personalDataOptions
 * @returns {Review[]}
 */
const removePersonalDataFromReviews = (reviews, personalDataOptions) => {
    for (const review of reviews) {
        if (!personalDataOptions.scrapeReviewerName) {
            review.name = null;
        }
        if (!personalDataOptions.scrapeReviewerId) {
            review.reviewerId = null;
        }
        if (!personalDataOptions.scrapeReviewerUrl) {
            review.reviewerUrl = null;
        }
        if (!personalDataOptions.scrapeReviewId) {
            review.reviewId = null;
        }
        if (!personalDataOptions.scrapeReviewUrl) {
            review.reviewUrl = null;
        }
        if (!personalDataOptions.scrapeResponseFromOwnerText) {
            review.responseFromOwnerText = null;
        }
    }
    return reviews;
}

/**
 * totalScore is string because it is parsed via localization
 * @param {{
 *    page: Puppeteer.Page,
 *    reviewsCount: number,
 *    maxReviews: number,
 *    reviewsSort: string,
 *    reviewsTranslation: string,
 *    defaultReviewsJson: any,
 *    personalDataOptions: PersonalDataOptions,
 * }} options
 * @returns {Promise<Review[]>}
 */
module.exports.extractReviews = async ({ page, reviewsCount,
    maxReviews, reviewsSort, reviewsTranslation, defaultReviewsJson, personalDataOptions }) => {

    /** Returned at the last line @type {Review[]} */
    let reviews = [];

    // If we already have all reviews from the page as default ones, we can finish
    // Just need to sort appropriately manually
    if (reviewsCount > 0 && defaultReviewsJson && defaultReviewsJson.length >= reviewsCount) {
        reviews = defaultReviewsJson
            .map((defaultReviewJson) => parseReviewFromJson(defaultReviewJson, reviewsTranslation));
        // mostRelevant is default

        if (reviewsSort === 'newest') {
            reviews.sort((review1, review2) => {
                const unixDate1 = new Date(review1.publishedAtDate).getTime();
                const unixDate2 = new Date(review2.publishedAtDate).getTime();
                return unixDate2 - unixDate1;
            })
        }
        if (reviewsSort === 'highestRanking') {
            reviews.sort((review1, review2) => review2.stars - review1.stars);
        }
        if (reviewsSort === 'lowestRanking') {
            reviews.sort((review1, review2) => review1.stars - review2.stars);
        }
        log.info(`[PLACE]: Reviews extraction finished: ${reviews.length}/${reviewsCount} --- ${page.url()}`);
    } else {
        // Standard scrolling
        const reviewsButtonSel = 'button[jsaction="pane.reviewChart.moreReviews"]';

        // TODO: We can probably safely remove this for reviewsCount == 0
        // Will keep it now as a double check
        try {
            await page.waitForSelector(reviewsButtonSel, { timeout: 15000 });
        } catch (e) {
            log.warning(`Could not find reviews count, check if the page really has no reviews --- ${page.url()}`);
        }

        // click the consent iframe, working with arrays so it never fails.
        // also if there's anything wrong with Same-Origin, just delete the modal contents
        // TODO: Why is this isolated in reviews?
        await page.$$eval('#consent-bump iframe', async (frames) => {
            try {
                frames.forEach((frame) => {
                    // @ts-ignore
                    [...frame.contentDocument.querySelectorAll('#introAgreeButton')].forEach((s) => s.click());
                });
            } catch (e) {
                document.querySelectorAll('#consent-bump > *').forEach((el) => el.remove());
            }
        });

        // TODO: Scrape default reviews (will allow us to extract 10 reviews by default without additional clicking)
        if (reviewsCount && typeof maxReviews === 'number' && maxReviews > 0) {
            await page.waitForSelector(reviewsButtonSel);
            // await page.click(reviewsButtonSel);

            /** @type {{[key: string]: number}} */
            const reviewSortOptions = {
                mostRelevant: 0,
                newest: 1,
                highestRanking: 2,
                lowestRanking: 3,
            };

            // This is unnecessary as we can sort via URL manipulation
            // TODO: Remove later, should not be needed
            /*
            const sortPromise1 = async () => {
                try {
                    await page.click('button[data-value="Sort"], [class*=dropdown-icon]');
                    await sleep(1000);
                    for (let i = 0; i < reviewSortOptions[reviewsSort]; i += 1) {
                        await page.keyboard.press('ArrowDown');
                        await sleep(500);
                    }
                    await page.keyboard.press('Enter');
                } catch (e) {
                    log.debug('[PLACE]: Unable to sort reviews!');
                }
            };
            */

            await sleep(500);
            const [reviewsResponse] = await Promise.all([
                page.waitForResponse((response) => response.url().includes('preview/review/listentitiesreviews')),
                page.click(reviewsButtonSel)
                // sortPromise1(),
                // This is here to work around the default setting not giving us any XHR
                // TODO: Rework this

                // scrollTo(page, '.section-scrollbox.scrollable-y', 10000),
            ]);

            // We skip these baceause they are loaded again when we click on all reviews
            // Keeping them for reference as we might wanna use these and start with bigger offset
            // to save one API call
            /*
            const reviewResponseBody = await reviewsResponse.buffer();
            const reviewsFirst = parseReviewFromResponseBody(reviewResponseBody);
            reviews.push(...reviewsFirst);
            reviews = reviews.slice(0, maxReviews);
            */
            log.info(`[PLACE]: Extracting reviews: ${reviews.length}/${reviewsCount} --- ${page.url()}`);
            let reviewUrl = reviewsResponse.url();

            reviewUrl = reviewUrl.replace(/!3e\d/, `!3e${reviewSortOptions[reviewsSort] + 1}`);

            // TODO: We capture the first batch, this should not start from 0 I think
            // Make sure that we star review from 0, setting !1i0
            reviewUrl = reviewUrl.replace(/!1i\d+/, '!1i0');

            /** @param {string} url */
            const increaseLimitInUrl = (url) => {
                // @ts-ignore
                const numberString = reviewUrl.match(/!1i(\d+)/)[1];
                const number = parseInt(numberString, 10);
                return url.replace(/!1i\d+/, `!1i${number + 10}`);
            };

            while (reviews.length < maxReviews) {
                // Request in browser context to use proxy as in browser
                const responseBody = await page.evaluate(async (url) => {
                    const response = await fetch(url);
                    return response.text();
                }, reviewUrl);
                const { currentReviews, error } = parseReviewFromResponseBody(responseBody, reviewsTranslation);
                if (error) {
                    // This means that invalid response were returned
                    // I think can happen if the review count changes
                    log.warning(`Invalid response returned for reviews. `
                    + `This might be caused by updated review count. The reviews should be scraped correctly. ${page.url()}`);
                    log.warning(error);
                    break;
                }
                if (currentReviews.length === 0) {
                    break;
                }
                reviews.push(...currentReviews);
                reviews = reviews.slice(0, maxReviews);
                log.info(`[PLACE]: Extracting reviews: ${reviews.length}/${reviewsCount} --- ${page.url()}`);
                reviewUrl = increaseLimitInUrl(reviewUrl);
            }
            log.info(`[PLACE]: Reviews extraction finished: ${reviews.length}/${reviewsCount} --- ${page.url()}`);
            await navigateBack(page, 'reviews');
        }
    }
    reviews = reviews.slice(0, maxReviews);
    return removePersonalDataFromReviews(reviews, personalDataOptions);
};

/**
 * @param {{
 * page: Puppeteer.Page,
 * maxImages: number,
 }} options
 */
module.exports.extractImages = async ({ page, maxImages }) => {
    if (!maxImages || maxImages === 0) {
        return undefined;
    }

    let resultImageUrls;

    const mainImageSel = '.section-hero-header-image-hero-container';
    const mainImage = await page.waitForSelector(mainImageSel);

    if (maxImages === 1) {
        // @ts-ignore
        const imageUrl = await mainImage.$eval('img', (el) => el.src);
        resultImageUrls = [imageUrl];
    }
    if (maxImages > 1) {
        await sleep(2000);
        await mainImage.click();
        let lastImage = null;
        let pageBottom = 10000;
        let imageUrls = [];

        log.info(`[PLACE]: Infinite scroll for images started, url: ${page.url()}`);

        for (; ;) {
            // TODO: Debug infiniteScroll properly, it can get stuck in there sometimes, for now just adding a race
            await Promise.race([
                infiniteScroll(page, pageBottom, '.section-scrollbox', 1),
                Apify.utils.sleep(20000),
            ]);
            imageUrls = await page.evaluate(() => {
                /** @type {string[]} */
                const urls = [];
                $('[data-photo-index]').each((i, el) => {
                    // @ts-ignore
                    const urlMatch = $(el).find('div').eq(0).attr('style').match(/url\("(.*)"\)/);
                    if (!urlMatch) return;
                    let imageUrl = urlMatch[1];
                    if (imageUrl[0] === '/') imageUrl = `https:${imageUrl}`;
                    urls.push(imageUrl);
                });
                return urls;
            });
            if (imageUrls.length >= maxImages || lastImage === imageUrls[imageUrls.length - 1]) {
                log.info(`[PLACE]: Infinite scroll for images finished, url: ${page.url()}`);
                break;
            }
            log.info(`[PLACE]: Infinite scroll continuing for images, currently ${imageUrls.length}, url: ${page.url()}`);
            lastImage = imageUrls[imageUrls.length - 1];
            pageBottom += 6000;
        }
        resultImageUrls = imageUrls.slice(0, maxImages);
    }

    return enlargeImageUrls(resultImageUrls);
};
