const Apify = require('apify');

const { getGeolocation, findPointsInPolygon } = require('./polygon');

exports.prepareSearchUrls = async ({ lat, lng, zoom, country, state, city, postalCode }) => {
    // Base part of the URLs to make up the startRequests
    const startUrlSearches = [];

    let geo;

    // preference for startUrlSearches is lat & lng > & state & city
    if (lat || lng) {
        if (!lat || !lng) {
            throw 'You have to defined both lat and lng!';
        }
        startUrlSearches.push(`https://www.google.com/maps/@${lat},${lng},${zoom}z/search`);
    } else if (country || state || city || postalCode) {
        geo = await Apify.getValue('GEO');
        // Takes from KV or create a new one
        geo = geo || await getGeolocation({ country, state, city, postalCode });

        Apify.events.on('migrating', async () => {
            await Apify.setValue('GEO', geo);
        });

        const points = await findPointsInPolygon(geo, zoom);
        for (const point of points) {
            startUrlSearches.push(`https://www.google.com/maps/@${point.lat},${point.lon},${zoom}z/search`);
        }
    } else {
        startUrlSearches.push('https://www.google.com/maps/search/');
    }
    return { startUrlSearches, geo };
};
