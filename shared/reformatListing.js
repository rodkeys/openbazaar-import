const config = require("../config.json"),
fs = require("fs"),
    request = require("request");


exports.generateOBProductObject = (data) => {
    let listing = {
        item: {},
        metadata: {}
    };


    listing.item.title = data.title;
    listing.item.description = data.description;
    listing.item.tags = data.tags;
    listing.item.categories = data.categories;
    listing.item.nsfw = false;
    listing.item.condition = config.defaultProductSettings.item.condition;
    listing.item.price = Number(data.price.toFixed(0));
    listing.item.options = data.options;
    listing.item.skus = data.skus;
    listing.item.processingTime = config.defaultProductSettings.item.processingTime;
    listing.item.images = data.images;

    listing.metadata.contractType = config.defaultProductSettings.contractType;
    listing.metadata.format = config.defaultProductSettings.format;
    listing.metadata.expiry = config.defaultProductSettings.productExpiry;
    listing.metadata.pricingCurrency = config.defaultProductSettings.pricingCurrency;
    listing.metadata.acceptedCurrencies = config.defaultProductSettings.acceptedCurrencies;

    listing.shippingOptions = config.defaultProductSettings.shippingOptions;
    listing.termsAndConditions = config.defaultProductSettings.termsAndConditions;
    listing.refundPolicy = config.defaultProductSettings.refundPolicy;
    listing.taxes = config.defaultProductSettings.taxes;
    listing.coupons = config.defaultProductSettings.coupons;
    listing.moderators = config.defaultProductSettings.moderators;

    return listing;
};

// Generate an auth key for the header. Required fall all OpenBazaar API calls.
exports.getOBAuth = (config) => {
    // Encoding as per API Specification.
    const combinedCredential = `${config.username}:${config.password}`,
        base64Credential = Buffer.from(combinedCredential).toString("base64"),
        readyCredential = `Basic ${base64Credential}`;

    return {"Authorization": readyCredential};
}

exports.sendListingToOpenBazaarNode = (data) => {
    return new Promise(async (resolve, reject) => {
        // fs.writeFileSync(String(Date.now()), JSON.stringify(data));
        request.post({
            url: `${config.openbazaarNodeSettings.protocol}://${config.openbazaarNodeSettings.host}:${config.openbazaarNodeSettings.port}/ob/listing`,
            json: data,
            headers: this.getOBAuth(config.openbazaarNodeSettings)
        }, (err, resp, body) => {
            if (err) {
                reject(err);
            } else {
                if (body.reason) {
                    reject(body.reason);
                } else {
                    resolve(body);
                }
            }
        })
    });
};


exports.sendImagesToOpenBazaarNode = (imageList) => {
    return new Promise(async (resolve, reject) => {
        let openBazaarImageList = [];

        for (let i = 0; i < imageList.length; i++) {
            openBazaarImageList.push({
                filename: String(Date.now()),
                image: imageList[i]
            });
        };

        request.post({
            url: `${config.openbazaarNodeSettings.protocol}://${config.openbazaarNodeSettings.host}:${config.openbazaarNodeSettings.port}/ob/images`,
            json: openBazaarImageList,
            headers: this.getOBAuth(config.openbazaarNodeSettings)
        }, (err, resp, body) => {
            if (err) {
                console.log(err);
            };
            resolve(body);
        })
    });
};


exports.createVendorListing = (data) => {
    return new Promise(async (resolve, reject) => {
        // Reformat listing data to match OB's specifications
        const listingOne = this.generateOBProductObject(data);

        this.sendListingToOpenBazaarNode(listingOne).then(() => {
            resolve(listingOne);
        }).catch((err) => {
            reject(err);
        })
    });
};