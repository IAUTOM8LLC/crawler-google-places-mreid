const Apify = require('apify');

const { utils: { log } } = Apify;

exports.Stats = class Stats {
    constructor(logInterval = 30) {
        this.stats = { failed: 0, ok: 0, outOfPolygon: 0, outOfPolygonCached: 0, places: 0, maps: 0 };
        this.isLoaded = false;

        if (Number.isNaN(logInterval)) {
            throw new Error('logInterval parameter is not number!');
        }

        Apify.events.on('migrating', async () => {
            await this.saveStats();
        });

        setInterval(async () => {
            await this.saveStats();
        }, logInterval * 1000);
    }

    async logInfo() {
        const statsArray = [];

        for (const [key, value] of Object.entries(this.stats)) {
            statsArray.push(`${key}: ${value}`);
        }

        log.info(`[STATS]: ${statsArray.join(' | ')}`);
    }

    async loadInfo() {
        // load old stats
        const stats = await Apify.getValue('STATS');
        if (stats) this.stats = stats;

        // mark as loaded
        this.isLoaded = true;
    }

    async saveStats() {
        if (!this.isLoaded) throw new Error('Cannot save before loading old data!');
        await Apify.setValue('STATS', this.stats);
        log.debug('[STATS]: Saved');

        await this.logInfo();
    }

    failed() {
        this.stats.failed++;
    }

    ok() {
        this.stats.ok++;
    }

    outOfPolygon() {
        this.stats.outOfPolygon++;
    }

    maps() {
        this.stats.maps++;
    }

    places() {
        this.stats.places++;
    }

    outOfPolygonCached() {
        this.stats.outOfPolygonCached++;
    }
};
