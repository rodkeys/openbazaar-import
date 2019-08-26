const shopifyImportCtrl = require("./shopify/shopify"),
    fs = require("fs"),
    Papa = require('papaparse'),
    config = require("./config.json"),
    importCSV = fs.createReadStream(`./${config.csvSettings.fileName}`);

(() => {
    Papa.parse(importCSV, {
        complete: async (results) => {
            rows = results.data;
            const formattedImportResults = await shopifyImportCtrl.importShopifyProductListings(rows);
            console.log("\nSuccessfully Imported:\n", formattedImportResults.listingSuccessArray);
            console.log("\nFailed Imports:\n", formattedImportResults.listingErrorsArray);
        }
    });
})();