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

    return { "Authorization": readyCredential };
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
        if (imageList.length == 0) {
            // Use default image if no images are provided
            const productImageFile = fs.readFileSync(__dirname + "/../static/openbazaar-logo.png");
            openBazaarImageList.push({
                filename: String(Date.now()),
                image: productImageFile.toString("base64")
            });
        } else {
            for (let i = 0; i < imageList.length; i++) {
                openBazaarImageList.push({
                    filename: String(Date.now()),
                    image: imageList[i]
                });
            };
        }
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

// Do special format techniques 
exports.formatListingForImport = (listingOne) => {
    if (listingOne.title) {
        listingOne.title = listingOne.title.slice(0, 140);
    };

    if (listingOne.description) {
        listingOne.description = listingOne.description.slice(0, 2500);
    };

    if (listingOne.tags) {
        listingOne.tags = listingOne.tags.slice(0, 10);
    };

    for (let i = 0; i < listingOne.tags.length; i++) {
        listingOne.tags[i] = listingOne.tags[i].slice(0, 40);
    };

    if (listingOne.categories) {
        listingOne.categories = listingOne.categories.slice(0, 10);
    };

    for (let i = 0; i < listingOne.categories.length; i++) {
        listingOne.categories[i] = listingOne.categories[i].slice(0, 40);
    };

    if (listingOne.skus) {
        for (let i = 0; i < listingOne.skus.length; i++) {
            if (listingOne.skus[i].productID) {
                listingOne.skus[i].productID = listingOne.skus[i].productID.slice(0, 40);
            }
        }
    };

    return listingOne;
};

exports.captureSinglePlatformImage = (productUrl) => {
    return new Promise(async (resolve, reject) => {
        request.get({
            headers: { 'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.100 Safari/537.36" },
            url: productUrl,
            encoding: "binary"
        }, function(error, response, body) {
            if (error) {
                reject(error);
            } else {
                resolve(Buffer.from(body, "binary").toString("base64"))
            };
        });
    });
};