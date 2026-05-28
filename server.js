const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 

const ACCOUNTS_FILE = path.join(process.cwd(), 'accounts.json');

// Use a Map for true O(1) lookups
const assetCache = new Map();
let riotClientVersion = 'Unknown version'; // Fallback

function getAccounts() {
    try {
        if (!fs.existsSync(ACCOUNTS_FILE)) return [];
        const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error("Error reading accounts.json:", error);
        return [];
    }
}

function saveAccounts(accounts) {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

function getSkinVideo(skin) {
    if (!skin || !skin.levels) return null;
    for (let i = skin.levels.length - 1; i >= 0; i--) {
        if (skin.levels[i].streamedVideo) return skin.levels[i].streamedVideo;
    }
    return null;
}

async function loadValorantAssets() {
    console.log("Loading data from Valorant-API...");
    const endpoints = [
        { key: 'version', url: 'https://valorant-api.com/v1/version' },
        { key: 'skins', url: 'https://valorant-api.com/v1/weapons/skins' },
        { key: 'bundles', url: 'https://valorant-api.com/v1/bundles' },
        { key: 'cards', url: 'https://valorant-api.com/v1/playercards' },
        { key: 'sprays', url: 'https://valorant-api.com/v1/sprays' },
        { key: 'buddies', url: 'https://valorant-api.com/v1/buddies/levels' },
        { key: 'titles', url: 'https://valorant-api.com/v1/playertitles' },
        { key: 'flex', url: 'https://valorant-api.com/v1/flex' } 
    ];
    
    let rawData = {};
    for (const ep of endpoints) {
        try {
            const res = await fetch(ep.url, { cache: 'no-store' });
            const json = await res.json();
            rawData[ep.key] = json.data;
        } catch (e) { 
            console.error(`Error loading ${ep.key}:`, e); 
        }
    }
    // Update dynamic Riot Client Version
    if (rawData.version && rawData.version.riotClientVersion) {
        riotClientVersion = rawData.version.riotClientVersion;
    }

    // Build O(1) Cache Map
    if (rawData.skins) {
        rawData.skins.forEach(skin => {
            const skinData = { name: skin.displayName, image: skin.displayIcon || (skin.levels[0] ? skin.levels[0].displayIcon : ''), video: getSkinVideo(skin), type: 'Skin' };
            assetCache.set(skin.uuid.toLowerCase(), skinData);
            skin.levels.forEach(l => assetCache.set(l.uuid.toLowerCase(), skinData));
        });
    }
    
    if (rawData.sprays) {
        rawData.sprays.forEach(s => assetCache.set(s.uuid.toLowerCase(), { name: s.displayName, image: s.fullTransparentIcon || s.displayIcon, animation: s.animationGif, type: 'Spray' }));
    }

    if (rawData.cards) {
        rawData.cards.forEach(c => assetCache.set(c.uuid.toLowerCase(), { name: c.displayName, image: c.wideArt || c.displayIcon, fullImage: c.largeArt, type: 'Card' }));
    }

    if (rawData.buddies) {
        rawData.buddies.forEach(b => assetCache.set(b.uuid.toLowerCase(), { name: b.displayName, image: b.displayIcon, type: 'Buddy' }));
    }

    if (rawData.titles) {
        rawData.titles.forEach(t => assetCache.set(t.uuid.toLowerCase(), { name: t.titleText || t.displayName, image: null, type: 'Title' }));
    }

    if (rawData.flex) {
        rawData.flex.forEach(f => assetCache.set(f.uuid.toLowerCase(), { name: f.displayName, image: f.displayIcon, type: 'Flex' }));
    }

    // Store bundles separately
    assetCache.set('all_bundles', rawData.bundles || []);

    console.log(`✅ Assets loaded successfully! Riot Client Version: ${riotClientVersion}`);
}

function findItem(uuid) {
    const item = assetCache.get(uuid.toLowerCase());
    return item ? { ...item } : { name: "Unknown Item", image: "", type: 'Unknown' };
}

// Fixed Region Shard Mapping Logic
function getPdUrl(reg) {
    const r = reg ? reg.toLowerCase() : 'na';
    const map = { 
        'ap': 'ap', 'as': 'ap', 'ind': 'ap', 'jp': 'ap', 'oce': 'ap', 
        'eu': 'eu', 'ru': 'eu', 'tr': 'eu', 
        'kr': 'kr', 
        'latam': 'latam', 
        'br': 'br' 
    };
    return `https://pd.${map[r] || 'na'}.a.pvp.net`;
}

async function getRiotData(cookieString) {
    const RIOT_UA = 'RiotGamesApi/24.11.0.4602 rso-auth (Windows;10;;Professional, x64) riot_client/0';
    try {
        const authRes = await fetch('https://auth.riotgames.com/authorize?client_id=play-valorant-web-prod&response_type=token%20id_token&redirect_uri=https://playvalorant.com/opt_in&scope=account%20openid&nonce=1', {
            headers: { 'Cookie': cookieString, 'User-Agent': RIOT_UA },
            redirect: 'manual',
            cache: 'no-store' // Force no-cache to avoid cross-account leak
        });
        
        const location = authRes.headers.get('location');
        if (!location || location.includes('login') || !location.includes('access_token')) {
            throw new Error("Cookie expired or invalid. Please update your cookie.");
        }
        
        const accessToken = new URLSearchParams(location.split('#')[1]).get('access_token');
        const entRes = await fetch('https://entitlements.auth.riotgames.com/api/token/v1', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'User-Agent': RIOT_UA },
            cache: 'no-store'
        });
        const entToken = (await entRes.json()).entitlements_token;

        const userRes = await fetch('https://auth.riotgames.com/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': RIOT_UA },
            cache: 'no-store'
        });
        const userInfo = await userRes.json();
        
        const region = userInfo.affinity?.pp || userInfo.affinity?.live || 'na';
        const puuid = userInfo.sub;
        const pdUrl = getPdUrl(region);
        
        const storeRes = await fetch(`${pdUrl}/store/v3/storefront/${puuid}`, {
            method: 'POST', body: "{}",
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Riot-Entitlements-JWT': entToken,
                'Content-Type': 'application/json',
                'X-Riot-ClientVersion': riotClientVersion,
                'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
                'User-Agent': RIOT_UA
            },
            cache: 'no-store'
        });

        if (!storeRes.ok) throw new Error("Failed to fetch store data from Riot.");
        const storeData = await storeRes.json();
        
        let parsedStore = { 
            name: userInfo.acct.tag_line ? `${userInfo.acct.game_name}#${userInfo.acct.tag_line}` : userInfo.acct.game_name,
            daily: [], nightMarket: [], bundles: [], accessory: [],
            dailyExpires: Date.now() + (storeData.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds * 1000)
        };

        // 1. DAILY
        if (storeData.SkinsPanelLayout && storeData.SkinsPanelLayout.SingleItemOffers) {
            parsedStore.daily = storeData.SkinsPanelLayout.SingleItemOffers.map(uuid => {
                const item = findItem(uuid);
                const costData = storeData.SkinsPanelLayout.SingleItemStoreOffers.find(o => o.OfferID === uuid);
                return { ...item, cost: costData ? costData.Cost['85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741'] : 0 };
            });
        }

        // 2. NIGHT MARKET
        if (storeData.BonusStore) {
            parsedStore.nmExpires = Date.now() + (storeData.BonusStore.BonusStoreRemainingDurationInSeconds * 1000);
            parsedStore.nightMarket = storeData.BonusStore.BonusStoreOffers.map(offer => {
                const item = findItem(offer.Offer.OfferID);
                return {
                    ...item,
                    basePrice: offer.Offer.Cost['85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741'],
                    discountPrice: offer.DiscountCosts['85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741'],
                    discountPercent: offer.DiscountPercent
                };
            });
        }

        // 3. BUNDLES
        if (storeData.FeaturedBundle && storeData.FeaturedBundle.Bundles) {
            const allBundles = assetCache.get('all_bundles') || [];
            parsedStore.bundles = storeData.FeaturedBundle.Bundles.map(b => {
                const vBundle = allBundles.find(xb => xb.uuid.toLowerCase() === b.DataAssetID.toLowerCase());
                return {
                    name: vBundle ? vBundle.displayName : "Featured Bundle",
                    image: vBundle ? vBundle.displayIcon2 : "",
                    cost: b.TotalDiscountedCost ? b.TotalDiscountedCost['85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741'] : 0,
                    expires: Date.now() + (b.DurationRemainingInSeconds * 1000),
                    items: b.Items.map(bi => {
                        const info = findItem(bi.Item.ItemID);
                        return { ...info, cost: bi.DiscountedPrice };
                    })
                };
            });
        }

        // 4. ACCESSORY
        if (storeData.AccessoryStore) {
            parsedStore.accExpires = Date.now() + (storeData.AccessoryStore.AccessoryStoreRemainingDurationInSeconds * 1000);
            parsedStore.accessory = storeData.AccessoryStore.AccessoryStoreOffers.map(acc => {
                const item = findItem(acc.Offer.Rewards[0].ItemID);
                return { 
                    ...item, 
                    cost: acc.Offer.Cost['85ca954a-41f2-ce94-9b45-8ca3dd39a00d'],
                    isAccessory: true
                };
            });
        }

        return parsedStore;
    } catch (err) { 
        throw err; 
    }
}

// Routes
app.get('/', (req, res) => res.render('index', { accounts: getAccounts(), storeData: null, error: null, currentAcc: null }));

app.post('/add-account', (req, res) => {
    const { accName, cookie } = req.body;
    if (!accName || !cookie) return res.redirect('/');
    
    const accounts = getAccounts();
    const index = accounts.findIndex(a => a.name === accName);
    
    if (index >= 0) accounts[index].cookie = cookie;
    else accounts.push({ name: accName, cookie: cookie });
    
    saveAccounts(accounts);
    res.redirect('/');
});

app.post('/delete-account', (req, res) => {
    const { accName } = req.body;
    let accounts = getAccounts().filter(a => a.name !== accName);
    saveAccounts(accounts);
    res.redirect('/');
});

app.post('/check-store', async (req, res) => {
    const { cookie, accName } = req.body;
    try {
        const data = await getRiotData(cookie);
        res.render('index', { accounts: getAccounts(), storeData: data, error: null, currentAcc: data.name });
    } catch (err) {
        res.render('index', { accounts: getAccounts(), storeData: null, error: err.message, currentAcc: accName });
    }
});

// Start Server only after loading assets
const { exec } = require('child_process');

loadValorantAssets().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`✅ Server is running at http://localhost:${PORT}`);
        exec(`start http://localhost:${PORT}`); 
    });
}).catch(err => {
    console.error("Failed to start server due to asset loading error:", err);
});