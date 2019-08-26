const sharedImportCtrl = require("../shared/reformatListing"),
    request = require("request");

exports.captureSingleShopifyImage = (productUrl) => {
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





// Import a list of products
exports.importShopifyProductListings = async (importData) => {
    // This will be where we construct the listing based on 
    let listingSuccessArray = [],
        listingErrorsArray = [];

    // Assign property names to a referenceable index
    let propertyFields = {};
    for (let i = 0; i < importData[0].length; i++) {
        propertyFields[importData[0][i]] = i;
    };

    // Remove first row because it's the property field
    importData.splice(0, 1);

    // Remove empty or incomplete rows
    for (let i = 0; i < importData.length; i++) {
        if (importData[i].length != Object.keys(propertyFields).length) {
            importData.splice(i, 1);
            i--;
        };
    };

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
        console.log(`Product ${i + 1}/${Object.keys(handleObj).length} is being imported`)
        // Array of all rows for a specific handle
        let handleArrays = handleObj[Object.keys(handleObj)[i]],
            // Assemble an array of option names and their associated variants
            optionsArray = [],
            skuArray = [],
            imageArray = [],
            // Determine lowest price (used in surcharge calculation)
            lowestPrice;

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

        // Format prices for OB
        lowestPrice = lowestPrice * 100;

        // Every handleArray is correlated with the number of possible options to choose from
        // Therefore each handleArray will have on corresponding sku
        for (let y = 0; y < handleArrays.length; y++) {

            let variantCombo = [],
                stringVariantCombo = [],
                variantPrice = Number(handleArrays[y][propertyFields[`Variant Price`]]) * 100,
                variantInventory = Number(handleArrays[y][propertyFields[`Variant Inventory Qty`]]),
                variantProductID = handleArrays[y][propertyFields[`Variant SKU`]]

            // You need to generate a sku for every option that exists
            for (let z = 0; z < optionsArray.length; z++) {
                // If there is one or fewer variants for an option then remove it (not compatible with OB rules) 
                if (optionsArray[z].variantNames.length < 2) {
                    optionsArray.splice(z, 1);
                    continue;
                }
                let variantValue = handleArrays[y][propertyFields[`Option${z + 1} Value`]],
                    variantIndex = optionsArray[z].variantNames.indexOf(variantValue);

                // Assign variant indexes to skus
                if (variantIndex != -1) {
                    stringVariantCombo.push(variantValue);
                    variantCombo.push(variantIndex);
                }
            }

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

        if (listingTags != "") {
            listingTags = listingTags.split(", ");
        } else {
            listingTags = [];
        }

        if (listingCategories != "") {
            listingCategories = listingCategories.split(", ");
        } else {
            listingCategories = [];
        };

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
            contractType: "",
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
                inventoryCounter += Number(skuArray[i].inventory);
            };
            listingOne.inventory = inventoryCounter;
        } else {
            listingOne.inventory = Number(handleArrays[0][propertyFields["Variant Inventory Qty"]]);
            listingOne.sku = handleArrays[0][propertyFields[`Variant SKU`]]
        };

        // Reduce image array to max possible images per listing (6)
        imageArray = imageArray.slice(0, 6);

        let imageList = [];

        for (let i = 0; i < imageArray.length; i++) {
            try {
                imageList.push(await this.captureSingleShopifyImage(imageArray[i]));
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

        try {
            listingOne.images = formattedImageList;
            await sharedImportCtrl.createVendorListing(listingOne);
            listingSuccessArray.push({ listingHandle: handleArrays[0][propertyFields["Handle"]] });
        } catch (err) {
            listingErrorsArray.push({ message: err, listingHandle: handleArrays[0][propertyFields["Handle"]] });
        };
    };

    return {
        listingSuccessArray: listingSuccessArray,
        listingErrorsArray: listingErrorsArray
    };
};