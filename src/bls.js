const API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;

/** USPS state postal code to 2-digit FIPS code, used to build the 7-char OEWS area code (FIPS + 5 zeros). */
const STATE_FIPS = {
    AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10',
    DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19',
    KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27',
    MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35',
    NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
    SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53',
    WV: '54', WI: '55', WY: '56', PR: '72', VI: '78',
};

/** OEWS data type codes, per BLS's documented series ID reference. */
const DATA_TYPES = {
    employment: '01',
    annualMeanWage: '04',
    hourlyMeanWage: '03',
    annualMedianWage: '13',
    hourlyMedianWage: '08',
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, { ...options, signal: controller.signal });
        } catch (err) {
            lastError = err.name === 'AbortError' ? new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`) : err;
            if (attempt < MAX_ATTEMPTS) {
                await sleep(1000 * 2 ** (attempt - 1));
                continue;
            }
            throw lastError;
        } finally {
            clearTimeout(timeoutId);
        }
        if (res.ok) return res;
        if (!TRANSIENT_STATUSES.has(res.status)) {
            throw new Error(`BLS API request failed: ${res.status} ${res.statusText}`);
        }
        lastError = new Error(`BLS API request failed: ${res.status} ${res.statusText}`);
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
}

/** Builds a 25-character OEWS series ID: OE + U + areaType(1) + areaCode(7) + industry(6, all=000000) + occupation(6) + dataType(2). */
function buildSeriesId({ areaType, areaCode, socCode, dataTypeCode }) {
    const occupationCode = socCode.replace(/-/g, '');
    if (!/^\d{6}$/.test(occupationCode)) {
        throw new Error(`Invalid SOC code "${socCode}" — expected format like "15-1252" or "151252".`);
    }
    return `OEU${areaType}${areaCode}000000${occupationCode}${dataTypeCode}`;
}

function resolveArea(stateCode) {
    if (!stateCode) return { areaType: 'N', areaCode: '0000000' };
    const fips = STATE_FIPS[stateCode.toUpperCase()];
    if (!fips) throw new Error(`Unknown state code "${stateCode}" — use a two-letter USPS code like "TX".`);
    return { areaType: 'S', areaCode: `${fips}00000` };
}

export async function fetchOccupationWages({ occupations, apiKey }) {
    const results = [];
    for (const occ of occupations) {
        const { socCode, stateCode } = occ;
        const { areaType, areaCode } = resolveArea(stateCode);

        const seriesIds = Object.entries(DATA_TYPES).map(([, code]) => buildSeriesId({ areaType, areaCode, socCode, dataTypeCode: code }));
        const seriesIdToField = Object.fromEntries(
            Object.entries(DATA_TYPES).map(([field, code]) => [buildSeriesId({ areaType, areaCode, socCode, dataTypeCode: code }), field]),
        );

        const body = { seriesid: seriesIds };
        if (apiKey) body.registrationkey = apiKey;

        const res = await fetchWithRetry(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (data.status !== 'REQUEST_SUCCEEDED') {
            results.push({ socCode, stateCode: stateCode ?? null, found: false, error: (data.message ?? []).join(' ') || 'BLS request did not succeed' });
            continue;
        }

        const record = { socCode, stateCode: stateCode ?? null, found: false };
        for (const series of data.Results?.series ?? []) {
            const field = seriesIdToField[series.seriesID];
            const latest = series.data?.[0];
            if (field && latest) {
                record[field] = Number(latest.value);
                record.found = true;
                record.dataYear = latest.year;
            }
        }
        results.push(record);
    }
    return results;
}
