const sharedImportCtrl = require("../shared/reformatListing"),
    request = require("request"),
    crypto = require('crypto'),
    HTMLParser = require('node-html-parser'),
    fetch = require('node-fetch'),
    then = require('then-request'),
    fs = require('fs');


// Grab web page and cache in data folder
exports.loadAmazonTopCategory = async (url) => {
    try {
        const hash = crypto.createHash('sha256');
        hash.update(url);

        const filename = hash.digest('hex');
        const fileDir = "data/"+filename;
        const filePath = fileDir + "/" + filename;
        var data = "";

        // Create cache directory for this category
        if(!fs.existsSync("data")) {
            fs.mkdirSync("data");
        }

        if(!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir);
        }

        if(fs.existsSync(filePath)) {
            console.log("Retrieving from cache\n");
            data = await fs.promises.readFile(filePath);
        } else {
            console.log("Retrieving from URL\n");
            const response = await fetch(url);
            data = await response.text();
            fs.writeFileSync(filePath, data, function (err,data) {
                if (err) {
                    return console.log(err);
                }
                // console.log(data);
            });

        }

        // Scrape page for top listings
        // Looking for 50 items indicated by: <span class="zg-badge-text">
        var root = HTMLParser.parse(data);
        var listingURLs = [];
        root.querySelectorAll(".a-list-item").forEach((item)=>{
            listingURLs.push("https://amazon.com" + item.querySelectorAll('.a-link-normal')[0].getAttribute('href'));
        });


        listingURLs.forEach((url) => {
            this.loadAmazonProductPage(url, fileDir);
        });

        // Parse each into a CSV
        listingURLs.forEach((url) => {
            const amazonURL = url;
            var urlHash = crypto.createHash('sha256');
            urlHash.update(amazonURL);

            var filename = urlHash.digest('hex');
            var filePath = fileDir + "/" + filename;

            console.log("Processing",filename,"into CSV...");

            // Scrape into an OpenBazaar listing object

            // Parse the page
            var itemFile = fs.readFileSync(`${filePath}`);
            var page = HTMLParser.parse(itemFile);

            // Title
            var title = page.querySelector("#productTitle").innerHTML;
            if(title == null) {
                title = "";
            }

            // Price
            if(page.querySelector("#priceblock_ourprice")) {
                var price = removeNewLines(page.querySelector("#priceblock_ourprice").innerHTML);

                // Description
                if(page.querySelector("#productDescription")) {
                    description = removeNewLines(page.querySelector("#productDescription").innerHTML);
                } else {
                    description = removeNewLines(page.querySelector("#featurebullets_feature_div").innerHTML);
                }

                // Tags
                breadcrumbs = page.querySelector("#wayfinding-breadcrumbs_feature_div");
                links = breadcrumbs.querySelectorAll(".a-link-normal");
                var tags = [];
                links.forEach((link) => {
                    tags.push(link.innerHTML.trim());
                });

                // Only getting the main image
                var productImage = page.querySelector(".imgTagWrapper img").getAttribute("src");
                productImage.replace(/\n/g,"").trim();
                product = productImage.replace("data:image/jpeg;base64,","");

                var item = {
                    price: removeNewLines(price.replace("$","")),
                    acceptedCoins: [],
                    shippingOptions: [],
                    title: removeNewLines(title),
                    description: description,
                    tags: tags,
                    categories: [tags[0]],
                     options: [],
                    skus: [{"bigQuantity":"-1"}],
                    // condition: "",
                    contractType: "PHYSICAL_GOOD",
                    // termsAndConditions: "",
                    // refundPolicy: "",
                    // moderators: [],
                    // coupons: [],
                    // taxes: [],
                    // processingTime: "~",
                    // escrow: true
                };


                processListing(item, product);

            } else {
                console.error("Item Not In Stock:",filename);
            }

        })

        console.log("DONE");

    } catch (err) {
        console.error(err);
    }
}

async function processListing(item, product) {

    imageList = await sendImageToOB(product);



    listingOne = sharedImportCtrl.formatListingForImport(item);

    try {
        getVendorListing(imageList, listingOne);
    } catch (err) {
        console.error(err);
    }
}

async function getVendorListing(formattedImageList, listingOne){
    try {
        listingErrorsArray = [];
        listingSuccessArray = [];
        console.log(formattedImageList);
        listingOne.images = formattedImageList;
        await sharedImportCtrl.createVendorListing(listingOne);
        let importSuccess = { importStatus: "Success", listingHandle: listingOne.title };
        console.log(importSuccess)
        listingSuccessArray.push(importSuccess);
    } catch (err) {
        let importFailure = { importStatus: "Failed", message: err, listingHandle: listingOne.title };
        console.log(importFailure)
        listingErrorsArray.push(importFailure);
    };
}

async function sendImageToOB(productImage) {
    let formattedImageList = await sharedImportCtrl.sendImagesToOpenBazaarNode([productImage]);

    if (formattedImageList) {
        for (let z = 0; z < formattedImageList.length; z++) {
            formattedImageList[z] = {
                filename: formattedImageList[z].filename,
                large: formattedImageList[z].hashes.large,
                medium: formattedImageList[z].hashes.medium,
                original: formattedImageList[z].hashes.original,
                small: formattedImageList[z].hashes.small,
                tiny: formattedImageList[z].hashes.tiny
            };
        };

    }
    return formattedImageList;
}

function removeNewLines(title) {
    title = title.replace(/[\t ]+\</g, "<");
    title = title.replace(/\t/g,"").trim();
    return title.replace(/\n/g,"").trim();
}



// Scrape each page and convert into CSV
exports.loadAmazonProductPage = async (url, fileDir) => {
    try {
        const amazonURL = url;
        const hash = crypto.createHash('sha256');
        hash.update(amazonURL);

        const filename = hash.digest('hex');
        const filePath = fileDir + "/" + filename;

        if (fs.existsSync(filePath)) {
            console.log("Retrieving", filename, "from cache");
            const data = fs.readFileSync(filePath);
        } else {
            console.log("Retrieving from ", filename, "");

            then('GET', url).done((res) => {
                var data = res.getBody();
                fs.writeFile(filePath, data, function (err, data) {
                    if (err) {
                        return console.log(err);
                    }
                });
            });

        }
    } catch (err) {
        console.error(err);
    }
}

// Import a list of products
exports.importAmazonProductListings = async (importDataRaw) => {
    // This will be where we construct the listing based on
    let importData = JSON.parse(JSON.stringify(importDataRaw)),
        // This will be where we construct the listing based on
        listingSuccessArray = [],
        listingErrorsArray = [];

    // Assign property names to a referenceable index
    let propertyFields = {};
    for (let i = 0; i < importData[0].length; i++) {
        propertyFields[importData[0][i]] = i;
    };


    // Remove first row because it's the property field
    importData.splice(0, 1);

    // Separate each handle (this denotes an individual listing)
    let handleObj = {};



    for (let i = 0; i < importData.length; i++) {
        if (handleObj[importData[i][propertyFields["Handle"]]]) {
            handleObj[importData[i][propertyFields["Handle"]]].push(importData[i]);
        } else {
            handleObj[importData[i][propertyFields["Handle"]]] = [importData[i]];
        };
    };


    // Each run of for loop represents a single handle
    for (let i = 0; i < Object.keys(handleObj).length; i++) {

        // Array of all rows for a specific handle
        let handleArrays = handleObj[Object.keys(handleObj)[i]],
            // Assemble an array of option names and their associated variants
            optionsArray = [],
            skuArray = [],
            imageArray = [],
            // Determine lowest price (used in surcharge calculation)
            lowestPrice;

        // Need to remove data from overall importData to mark that we used it
        // importData.splice(0, handleArrays.length)

        // Need to assemble all variants {name: "size", variants: [{name: 'small'}] }
        for (let y = 0; y < handleArrays.length; y++) {
            if (handleArrays[y][propertyFields[`Image Src`]]) {
                imageArray.push(handleArrays[y][propertyFields[`Image Src`]]);
            }
            // Every Shopify row has option1 name attached. If it doesn't then it's not a complete row
            if (handleArrays[y][propertyFields[`Option1 Value`]]) {
                if (!lowestPrice || (lowestPrice > Number(handleArrays[y][propertyFields[`Variant Price`]]))) {
                    lowestPrice = Number(handleArrays[y][propertyFields[`Variant Price`]]);
                }

                // You need to build a an object of all options (and eventually match with variant names)
                for (let z = 0; z < 3; z++) {
                    // Only the first element of handleArray will have the option name
                    if (y == 0) {
                        if (handleArrays[0][propertyFields[`Option${z + 1} Name`]]) {
                            optionsArray.push({ name: handleArrays[0][propertyFields[`Option${z + 1} Name`]], variants: [], variantNames: [] });
                        };
                    };

                    const variantValue = handleArrays[y][propertyFields[`Option${z + 1} Value`]];

                    // If variant value does not exist in the array then add it
                    if (optionsArray[z] && variantValue != "" && optionsArray[z].variantNames.indexOf(variantValue) == -1) {
                        optionsArray[z].variantNames.push(variantValue);
                        optionsArray[z].variants.push({ name: variantValue });
                    }
                };
            } else {
                // Remove row if it's not complete
                handleArrays.splice(y, 1);
                y--;
            }
        };

        // If handleArrays is empty then skip a for loop
        if (handleArrays.length == 0) {
            continue;
        };

        // Format prices for OB
        lowestPrice = lowestPrice * 100;

        // Every handleArray is correlated with the number of possible options to choose from
        // Therefore each handleArray will have one corresponding sku
        for (let y = 0; y < handleArrays.length; y++) {

            let variantInventory,
                variantCombo = [],
                stringVariantCombo = [],
                variantPrice = Number(handleArrays[y][propertyFields[`Variant Price`]]) * 100,
                variantProductID = handleArrays[y][propertyFields[`Variant SKU`]];

            if (handleArrays[y][propertyFields[`Variant Inventory Qty`]] == null || handleArrays[y][propertyFields[`Variant Inventory Qty`]] == "") {
                variantInventory = handleArrays[y][propertyFields[`Variant Inventory Qty`]];
            } else {
                variantInventory = Number(handleArrays[y][propertyFields[`Variant Inventory Qty`]]);
            };

            // Use this as a stand-in for the options array because you cannot change options array during the for loop
            let modifiedOptionsArray = JSON.parse(JSON.stringify(optionsArray));
            // You need to generate a sku for every option that exists
            for (let z = 0; z < optionsArray.length; z++) {
                // If there is one or fewer variants for an option then remove it (not compatible with OB rules)
                if (optionsArray[z].variantNames.length < 2) {
                    modifiedOptionsArray.splice(z, 1);
                    continue;
                } else {

                    let variantValue = handleArrays[y][propertyFields[`Option${z + 1} Value`]],
                        variantIndex = optionsArray[z].variantNames.indexOf(variantValue);

                    // Assign variant indexes to skus
                    if (variantIndex != -1) {
                        stringVariantCombo.push(variantValue);
                        variantCombo.push(variantIndex);
                    }
                }
            }

            optionsArray = modifiedOptionsArray;

            if (handleArrays.length > 1 && variantCombo.length > 0) {
                // Each loop will have one sku combination
                skuArray.push({
                    variantCombo: variantCombo,
                    surcharge: variantPrice - lowestPrice,
                    productID: variantProductID,
                    stringVariantCombo: stringVariantCombo,
                    inventory: variantInventory
                })
            }
        };

        let listingTags = handleArrays[0][propertyFields["Tags"]],
            listingCategories = handleArrays[0][propertyFields["Type"]];

        if (listingTags && listingTags != "") {
            listingTags = listingTags.split(", ");
        } else {
            listingTags = [];
        };

        if (listingCategories && listingCategories != "") {
            listingCategories = listingCategories.split(", ");
        } else {
            listingCategories = [];
        };

        // The first array should have most of the important property fields
        let listingOne = {
            price: lowestPrice,
            acceptedCoins: [],
            shippingOptions: [],
            title: handleArrays[0][propertyFields["Title"]],
            description: handleArrays[0][propertyFields["Body (HTML)"]],
            tags: listingTags,
            categories: listingCategories,
            options: optionsArray,
            productNote: "",
            condition: "",
            contractType: "PHYSICAL_GOOD",
            termsAndConditions: "",
            refundPolicy: "",
            moderators: [],
            coupons: [],
            taxes: [],
            processingTime: "~",
            escrow: true
        };

        if (skuArray.length > 0) {
            // Add up all inventory for all SKUs
            listingOne.skus = skuArray;
            let inventoryCounter = 0;
            for (let i = 0; i < skuArray.length; i++) {
                if (skuArray[i].inventory == null || skuArray[i].inventory == "") {
                    inventoryCounter = null;
                    break;
                };
                inventoryCounter += Number(skuArray[i].inventory);
            };
            listingOne.inventory = inventoryCounter;
        } else {
            if (handleArrays[0][propertyFields["Variant Inventory Qty"]] == null || handleArrays[0][propertyFields["Variant Inventory Qty"]] == "") {
                listingOne.inventory = null;
            } else {
                listingOne.inventory = Number(handleArrays[0][propertyFields["Variant Inventory Qty"]]);
            }
            listingOne.sku = handleArrays[0][propertyFields[`Variant SKU`]]
        };

        // Reduce image array to max possible images per listing (6)
        imageArray = imageArray.slice(0, 6);

        let imageList = [];

        for (let i = 0; i < imageArray.length; i++) {
            try {
                imageList.push(await sharedImportCtrl.captureSinglePlatformImage(imageArray[i]));
            } catch (err) {
                console.log(err);
            };
        };
        let formattedImageList = await sharedImportCtrl.sendImagesToOpenBazaarNode(imageList);

        if (formattedImageList) {
            for (let z = 0; z < formattedImageList.length; z++) {
                formattedImageList[z] = {
                    filename: formattedImageList[z].filename,
                    large: formattedImageList[z].hashes.large,
                    medium: formattedImageList[z].hashes.medium,
                    original: formattedImageList[z].hashes.original,
                    small: formattedImageList[z].hashes.small,
                    tiny: formattedImageList[z].hashes.tiny
                };
            };

        }

        listingOne = sharedImportCtrl.formatListingForImport(listingOne);

        try {
            listingOne.images = formattedImageList;
            await sharedImportCtrl.createVendorListing(listingOne);
            let importSuccess = { importStatus: "Success", listingHandle: handleArrays[0][propertyFields["Handle"]] };
            console.log(importSuccess)
            listingSuccessArray.push(importSuccess);
        } catch (err) {
            let importFailure = { importStatus: "Failed", message: err, listingHandle: handleArrays[0][propertyFields["Handle"]] };
            console.log(importFailure)
            listingErrorsArray.push(importFailure);
        };
    };

    return {
        listingSuccessArray: listingSuccessArray,
        listingErrorsArray: listingErrorsArray
    };
};
