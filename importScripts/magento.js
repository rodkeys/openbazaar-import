const sharedImportCtrl = require("../shared/reformatListing"),
    request = require("request");


// Import a list of products
exports.importMagentoProductListings = async (importDataRaw) => {
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
        if (importData[i][propertyFields["sku"]]) {
            handleObj[importData[i][propertyFields["sku"]]] = [importData[i]];
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
            productPrice = handleArrays[0][propertyFields["price"]];


        // Format prices for OB
        productPrice = productPrice * 100;

        let listingTags = [],
            listingCategories = handleArrays[0][propertyFields["categories"]],
            listingDescription = handleArrays[0][propertyFields["description"]];

        for (let y = 0; y < handleArrays.length; y++) {
            if (handleArrays[y][propertyFields[`base_image`]]) {
                imageArray = imageArray.concat(handleArrays[y][propertyFields[`base_image`]].split(", "));
            }
        };


        if (listingCategories && listingCategories != "") {
            listingCategories = listingCategories.split(",");
        } else {
            listingCategories = [];
        };


        // The first array should have most of the important property fields
        let listingOne = {
            price: productPrice,
            acceptedCoins: [],
            shippingOptions: [],
            title: handleArrays[0][propertyFields["name"]],
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


        if (handleArrays[0][propertyFields["qty"]] == null || handleArrays[0][propertyFields["qty"]] == "") {
            listingOne.inventory = null;
        } else {
            listingOne.inventory = Number(handleArrays[0][propertyFields["qty"]]);
        }
        listingOne.sku = handleArrays[0][propertyFields[`sku`]]

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

        console.log("");

        try {
            listingOne.images = formattedImageList;
            await sharedImportCtrl.createVendorListing(listingOne);
            let importSuccess = { importStatus: "Success", listingHandle: handleArrays[0][propertyFields["name"]] };
            console.log(importSuccess)
            listingSuccessArray.push(importSuccess);
        } catch (err) {
            let importFailure = { importStatus: "Failed", message: err, listingHandle: handleArrays[0][propertyFields["name"]] };
            console.log(importFailure)
            listingErrorsArray.push(importFailure);
        };
    };

    return {
        listingSuccessArray: listingSuccessArray,
        listingErrorsArray: listingErrorsArray
    };
};