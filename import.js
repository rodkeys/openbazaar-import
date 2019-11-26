const shopifyImportCtrl = require("./importScripts/shopify"),
    woocommerceImportCtrl = require("./importScripts/woocommerce"),
    fs = require("fs"),
    Papa = require('papaparse'),
    config = require("./config.json"),
    importFileName = process.argv.slice(-1)[0],
    importType = process.argv.slice(-2)[0];


(() => {
    if (importType && importFileName && process.argv.length == 4) {
        if (fs.existsSync(importFileName)) {
            const importCSV = fs.createReadStream(`${importFileName}`);
            Papa.parse(importCSV, {
                complete: async (results) => {
                    if (importType == "shopify") {
                        rows = results.data;
                        formattedImportResults = await shopifyImportCtrl.importShopifyProductListings(rows);
                    } else if (importType == "woocommerce") {
                        rows = results.data;
                        formattedImportResults = await woocommerceImportCtrl.importWoocommerceProductListings(rows);
                    } else {
                        console.log(`\nCSV type is not supported yet. \n\nCSV import options available are: "shopify" or "woocommerce". \n\nAn example valid command would be: "node import shopify products_export.csv"`);
                        return;
                    }
                    console.log("\nYour import has finished, the results are below:")
                    console.log("\nSuccessfully Imported Listings:\n", formattedImportResults.listingSuccessArray.length);
                    console.log("\nFailed Listing Imports:\n", formattedImportResults.listingErrorsArray.length);
                }
            })
        } else {
            console.log(`\nError: CSV is empty or nonexistent`);
            return;
        };
    } else {
        console.log(`\nError: Incorrect command format. \n\nAn example valid command would be: "node import shopify products_export.csv"`);
        return;
    }
})();