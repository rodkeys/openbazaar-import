const sharedImportCtrl = require("../shared/reformatListing"),
    request = require("request");



// Import a list of products
exports.importWoocommerceProductListings = async (importDataRaw) => {
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
    let handleObj = {},
        // VariableID tracks last variable/variant 
        variableID;

    for (let i = 0; i < importData.length; i++) {
        if (importData[i][propertyFields["Type"]] == "simple") {
            handleObj[importData[i][propertyFields["Name"]]] = [importData[i]];
        } else if (importData[i][propertyFields["Type"]] == "variable") {
            variableID = importData[i][propertyFields["Name"]];
            handleObj[importData[i][propertyFields["Name"]]] = [importData[i]];
        } else if (importData[i][propertyFields["Type"]] == "variation") {
            handleObj[variableID].push(importData[i]);
        } else {
            handleObj[importData[i][propertyFields["Name"]]] = [importData[i]];
        }
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



        // You need to build a an object of all options (and eventually match with variant names)
        for (let z = 0; z < 2; z++) {
            // Only the first element of handleArray will have the option name/values
            if (handleArrays[0][propertyFields[`Attribute ${z + 1} name`]]) {
                optionsArray.push({ name: handleArrays[0][propertyFields[`Attribute ${z + 1} name`]], variants: [], variantNames: [] });


                const variantValues = handleArrays[0][propertyFields[`Attribute ${z + 1} value(s)`]].split(", ");

                for (let q = 0; q < variantValues.length; q++) {
                    // If variant value does not exist in the array then add it
                    if (optionsArray[z] && variantValues[q] != "" && optionsArray[z].variantNames.indexOf(variantValues[q]) == -1) {
                        optionsArray[z].variantNames.push(variantValues[q]);
                        optionsArray[z].variants.push({ name: variantValues[q] });
                    };
                };
            };
        };

        // Need to assemble all variants {name: "size", variants: [{name: 'small'}] }
        for (let y = 0; y < handleArrays.length; y++) {
            if (handleArrays[y][propertyFields[`Images`]]) {
                imageArray = imageArray.concat(handleArrays[y][propertyFields[`Images`]].split(", "));
            }

            // Every Shopify row has option1 name attached. If it doesn't then it's not a complete row
            // if (handleArrays[y][propertyFields[`Option1 Value`]]) {
            if (!lowestPrice || (lowestPrice > Number(handleArrays[y][propertyFields[`Regular price`]]))) {
                lowestPrice = Number(handleArrays[y][propertyFields[`Regular price`]]);
            }

        };

        // Format prices for OB
        lowestPrice = lowestPrice * 100;

        // Every handleArray is correlated with the number of possible options to choose from
        // Therefore each handleArray will have one corresponding sku
        for (let y = 0; y < handleArrays.length; y++) {
            // 'variable' type does not correspond to a real SKU option
            if (handleArrays[y][propertyFields[`Type`]] == "variation") {
                let variantInventory,
                    variantCombo = [],
                    stringVariantCombo = [],
                    variantPrice = Number(handleArrays[y][propertyFields[`Regular price`]]) * 100,
                    variantProductID = handleArrays[y][propertyFields[`SKU`]];

                if (handleArrays[y][propertyFields[`Stock`]] == null || handleArrays[y][propertyFields[`Stock`]] == "") {
                    variantInventory = handleArrays[y][propertyFields[`Stock`]];
                } else {
                    variantInventory = Number(handleArrays[y][propertyFields[`Stock`]]);
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

                        let variantValue = handleArrays[y][propertyFields[`Attribute ${z + 1} value(s)`]],
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
            }
        };

        let listingTags = handleArrays[0][propertyFields["Tags"]],
            listingCategories = handleArrays[0][propertyFields["Categories"]],
            listingDescription = handleArrays[0][propertyFields["Description"]];

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

        // Replace new lines
        if (listingDescription) {
            listingDescription = listingDescription.replace(/(?:\r\n|\r|\n)/g, '<br>').split('\\n').join("");
        };


        // The first array should have most of the important property fields
        let listingOne = {
            price: lowestPrice,
            acceptedCoins: [],
            shippingOptions: [],
            title: handleArrays[0][propertyFields["Name"]],
            description: listingDescription,
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
            if (handleArrays[0][propertyFields["Stock"]] == null || handleArrays[0][propertyFields["Stock"]] == "") {
                listingOne.inventory = null;
            } else {
                listingOne.inventory = Number(handleArrays[0][propertyFields["Stock"]]);
            }
            listingOne.sku = handleArrays[0][propertyFields[`SKU`]]
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
        };

        listingOne = sharedImportCtrl.formatListingForImport(listingOne);

        console.log("");

        try {
            listingOne.images = formattedImageList;
            await sharedImportCtrl.createVendorListing(listingOne);
            let importSuccess = { importStatus: "Success", listingHandle: handleArrays[0][propertyFields["Name"]] };
            console.log(importSuccess)
            listingSuccessArray.push(importSuccess);
        } catch (err) {
            let importFailure = { importStatus: "Failed", message: err, listingHandle: handleArrays[0][propertyFields["Name"]] };
            console.log(importFailure)
            listingErrorsArray.push(importFailure);
        };

    };

    return {
        listingSuccessArray: listingSuccessArray,
        listingErrorsArray: listingErrorsArray
    };
};