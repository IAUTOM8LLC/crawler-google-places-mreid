const Apify = require('apify');

class ErrorManager {
    async initialize() {
        this.errorState = (await Apify.getValue('ERROR-MANAGER-STATE')) || {};
    }

    async persistState() {
        await Apify.setValue('ERROR-MANAGER-STATE', this.errorState);
    }

    // actionName is optional
    async tryWithScreenshot(page, actionFn, actionName) {
        const prettyActionName = actionName
            ? (actionName.charAt(0).toUpperCase() + actionName.slice(1)).replace(/-/g, ' ')
            : null;
        try {
            actionFn();
        } catch (e) {
            const screenshotKey = actionName || e.message.slice(0, 30).replace(/[^a-zA-Z0-9-_]/g, '-');
            await Apify.utils.puppeteer.saveSnapshot(page, { key: `ERROR-SNAPSHOT-${screenshotKey}` });
            if (prettyActionName) {
                e.message = `${prettyActionName} failed with: ${e.message}`;
            }
        }
    }
}

module.exports = ErrorManager;
