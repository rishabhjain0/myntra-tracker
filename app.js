// app.js
require('dotenv').config();
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

// Myntra URL
const MYNTRA_URL = "https://www.myntra.com/gold-coin?f=Brand%3AKalyan%20Jewellers";

// Keywords to detect Blinkdeal / discount
const KEYWORDS = ["blinkdeal", "OFF", "discount", "offer"];


const SAVE_DIR = path.join(__dirname, "html-files");

if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR);
}
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SENDER_MAIL_ID,
      pass: process.env.SENDER_APP_CODE // Use App Password
    }
  });



function saveToJsonFile(data) {
    const dir = path.join(process.cwd(), "json-files");

    // Ensure the directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    // Create file path
    const filePath = path.join(dir, `${Date.now()}.json`);

    // Write JSON pretty formatted
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");

    console.log(`✅ Data saved to ${filePath}`);
}


async function saveMyntraHTML(data) {
    try {
        console.log("⏳ Fetching Myntra page...");


        // Create timestamped filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `myntra-${timestamp}.html`;
        const filePath = path.join(SAVE_DIR, filename);

        // Save file
        fs.writeFileSync(filePath, data, "utf-8");
        console.log(`✅ Saved HTML to ${filePath}`);
    } catch (error) {
        console.error("❌ Error fetching Myntra page:", error.message);
    }
}



async function fetchHtmlpageViaLink(link) {

    const {
        data
    } = await axios.get(link, {
        headers: {
            "User-Agent": "Mozilla/5.0"
        }
    });

    return data;


}

function searchBlinkdeal(bodyText) {
    // Regex explanation:
    // blink\s*_?\s*deal
    // - \s* → optional spaces
    // - _? → optional underscore
    // /i → case-insensitive
    const regex = /blink\s*_?\s*deal/gi;
    const matches = bodyText.match(regex);
    return matches?.length > 0 ? 1 : 0;
}


function simplifyProducts(products) {
    return products
        .filter(product => !/22k/i.test(product.productName)) // remove products with "22K"
        .map(product => ({
            productId: product.productId,
            productName: product.productName,
            brand: product.brand,
            sizes: product.sizes,
            price: product.price,
            mrp: product.mrp,
            discount: product.discount,
            rating: product.rating,
            ratingCount: product.ratingCount,
            landingPageUrl: product.landingPageUrl,
            coupon: product.couponData?.couponDiscount ?
                {
                    code: product.couponData.couponDescription.couponCode,
                    discount: product.couponData.couponDiscount,
                    bestPrice: product.couponData.couponDescription.bestPrice
                } :
                null
        }));
}






// Fetch Myntra gold coin page
async function fetchMyntraPage() {
    try {
        let isBlinkDealFound = false;
        let isScriptWorking = true;
        const data = await fetchHtmlpageViaLink(MYNTRA_URL);
        const $ = cheerio.load(data);
        const bodyText = $("body").text();
        // saveMyntraHTML(bodyText);

        const startRegex = /{"landingPageUrl":/g;
        let match;
        let products = [];

        isBlinkDealFound = searchBlinkdeal(bodyText);

        while ((match = startRegex.exec(bodyText)) !== null) {
            let startIndex = match.index;
            let braceCount = 0;
            let endIndex = startIndex;

            for (let i = startIndex; i < bodyText.length; i++) {
                if (bodyText[i] === '{') braceCount++;
                else if (bodyText[i] === '}') braceCount--;

                if (braceCount === 0) {
                    endIndex = i + 1;
                    break;
                }
            }

            const jsonStr = bodyText.slice(startIndex, endIndex);

            try {
                const obj = JSON.parse(jsonStr);
                if (obj.productId) {
                    products.push(obj);
                }
            } catch (e) {
                // skip invalid
            }
        }

        if (products?.length == 0) {
            isScriptWorking = false;
        }

        products = simplifyProducts(products);



        if (products.length > 0) {
            const data = await fetchHtmlpageViaLink("https://www.myntra.com/" + products[0].landingPageUrl);
            const $ = cheerio.load(data);
            const bodyText = $("body").text();
            isBlinkDealFound = searchBlinkdeal(bodyText);
        }

        return {
            isBlinkDealFound,
            isScriptWorking,
            products
        }


        // saveToJsonFile(products);
    } catch (error) {
        console.error("Error fetching Myntra page:", error.message);
        return null;
    }
}




// Fetch latest gold price
// async function fetchGoldPrice() {
//     try {
//         const {
//             data
//         } = await axios.get("https://www.goldapi.io/api/XAU/INR", {
//             headers: {
//                 "x-access-token": "goldapi-token",
//                 "User-Agent": "Mozilla/5.0"
//             }
//         });

//         // console.log("gold price 24k", data);

//         return data.price_gram_24k; // Price per gram in INR
//     } catch (error) {
//         console.error("Error fetching gold price:", error.message);
//         return null;
//     }
// }

// Send email alert
async function sendEmailAlert(myntradata,isBlinkDealFound) {
    if(isBlinkDealFound){
        const mailOption1 = {
            from: process.env.SENDER_MAIL_ID,
            to: process.env.RECEIVER_MAIL_ID,
            subject: "Myntra Blinkdeal Alert!",
            text: `
                Myntra Blinkdeal Alert!
                I have found a word Blinkdeal in the Myntra page.
                product Details :
                ${myntradata?.products?.map((product) => {
                    return product?.landingPageUrl
                }).join("\n")}
    
                From: https://www.myntra.com/gold-coin
        `
        };

        try {
            await transporter.sendMail(mailOption1);
            console.log("✅ Alert email sent!");
        } catch (error) {
            console.error("❌ Error sending email:", error.message);
        }
    }
    else{

        const mailOption2 = {
            from: process.env.SENDER_MAIL_ID,
            to: process.env.RECEIVER_MAIL_ID,
            subject: "Altert: Tracker Not Working for Myntra!!!",
            text: `
                Myntra Tracker Not Working!
                Tracker Was trying to collect products but it did not get any results.
                please ask Mr. Rishabh Jain to kindly check/review the tracker.
    
                Thanks
        `
        }

        try {
            await transporter.sendMail(mailOption2);
            console.log("✅ Alert email sent!");
        } catch (error) {
            console.error("❌ Error sending email:", error.message);
        }

    }

  

   

  
}

// Main watcher
async function watcher() {
    console.log("⏳ Checking Myntra Blinkdeal...");

    const myntraData = await fetchMyntraPage();
    // const goldPrice = await fetchGoldPrice();

    if (!myntraData) return;
    if (myntraData.isBlinkDealFound) {
        await sendEmailAlert(myntraData,1);
    } 
    else if(!myntraData.isScriptWorking){
        await sendEmailAlert(myntraData,0);
    }
    else {
        console.log("❌ No Blinkdeal yet.");
    }
}

// Run every 5 minutes
setInterval(watcher, 5 * 60 * 1000);
watcher();