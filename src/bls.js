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

/** Full state names people type instead of the postal code. */
const STATE_NAMES = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
    connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC',
    florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
    kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
    michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE',
    nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
    pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
    tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
    'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'puerto rico': 'PR', 'virgin islands': 'VI',
};

/** Values that mean "national data", not a state. */
const NATIONAL = new Set(['', 'us', 'usa', 'u.s.', 'national', 'united states', 'nationwide']);

/** OEWS data type codes, per BLS's documented series ID reference. */
const DATA_TYPES = {
    employment: '01',
    annualMeanWage: '04',
    hourlyMeanWage: '03',
    annualMedianWage: '13',
    hourlyMedianWage: '08',
};
const SERIES_PER_LOOKUP = Object.keys(DATA_TYPES).length;

/** BLS caps the number of series in one request: 25 without a registration key, 50 with one. */
const MAX_SERIES_PER_REQUEST = { withoutKey: 25, withKey: 50 };

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

/**
 * Turns one entry of the input into a SOC code and a state, or explains what's wrong with it.
 * A single bad entry used to throw and fail the whole run (seen 2026-10-11 on a paying user's run),
 * losing every good lookup in the same batch. Entries can be a plain string ("15-1252") or an object,
 * and O*NET-style codes ("15-1252.00") and full state names ("California") are accepted.
 */
export function normalizeEntry(entry) {
    const raw = typeof entry === 'string' || typeof entry === 'number'
        ? { socCode: String(entry) }
        : (entry ?? {});
    const rawSoc = raw.socCode ?? raw.soc ?? raw.code ?? raw.occupationCode;
    const rawState = raw.stateCode ?? raw.state ?? null;
    const shown = { socCode: rawSoc == null ? null : String(rawSoc).trim(), stateCode: rawState == null ? null : String(rawState).trim() || null };

    if (shown.socCode == null || shown.socCode === '') {
        return { ...shown, error: 'Missing SOC code. Use the 6-digit code, e.g. "15-1252" (look it up at bls.gov/soc).' };
    }
    const digits = shown.socCode.replace(/\.\d{2}$/, '').replace(/[\s-]/g, '');
    if (!/^\d{6}$/.test(digits)) {
        return { ...shown, error: `"${shown.socCode}" isn't a SOC code. Use the 6-digit code, e.g. "15-1252" for software developers (look it up at bls.gov/soc).` };
    }
    const socCode = `${digits.slice(0, 2)}-${digits.slice(2)}`;

    const stateKey = (shown.stateCode ?? '').toLowerCase();
    if (NATIONAL.has(stateKey)) return { socCode, stateCode: null };
    const stateCode = STATE_FIPS[stateKey.toUpperCase()] ? stateKey.toUpperCase() : STATE_NAMES[stateKey];
    if (!stateCode) {
        return { socCode, stateCode: shown.stateCode, error: `Unknown state "${shown.stateCode}". Use a two-letter code like "TX", or leave it empty for national data.` };
    }
    return { socCode, stateCode };
}

/** Builds a 25-character OEWS series ID: OE + U + areaType(1) + areaCode(7) + industry(6, all=000000) + occupation(6) + dataType(2). */
function buildSeriesId({ socCode, stateCode }, dataTypeCode) {
    const area = stateCode ? `S${STATE_FIPS[stateCode]}00000` : 'N0000000';
    return `OEU${area}000000${socCode.replace('-', '')}${dataTypeCode}`;
}

/**
 * Looks up every entry and returns one record per entry, in input order, each with a `billable` flag.
 * Only lookups BLS actually answered are billable; entries with bad input, or that BLS refused
 * (for example when its daily request limit is used up), come back with an `error` and aren't charged.
 * Several lookups share one BLS request (5 series each), which stretches BLS's daily request limit.
 */
export async function fetchOccupationWages({ occupations, apiKey }) {
    const entries = occupations.map(normalizeEntry);
    const records = entries.map(({ socCode, stateCode, error }) => ({
        socCode, stateCode, found: false, ...(error ? { error } : {}), billable: false,
    }));

    const valid = entries.map((e, i) => (e.error ? null : i)).filter((i) => i !== null);
    const perRequest = Math.floor((apiKey ? MAX_SERIES_PER_REQUEST.withKey : MAX_SERIES_PER_REQUEST.withoutKey) / SERIES_PER_LOOKUP);
    let serviceErrors = 0;

    for (let start = 0; start < valid.length; start += perRequest) {
        const batch = valid.slice(start, start + perRequest);
        const fieldsBySeries = new Map();
        for (const i of batch) {
            for (const [field, code] of Object.entries(DATA_TYPES)) {
                const id = buildSeriesId(entries[i], code);
                if (!fieldsBySeries.has(id)) fieldsBySeries.set(id, []);
                fieldsBySeries.get(id).push({ i, field });
            }
        }

        const body = { seriesid: [...fieldsBySeries.keys()] };
        if (apiKey) body.registrationkey = apiKey;

        let data;
        try {
            const res = await fetchWithRetry(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            data = await res.json();
        } catch (err) {
            data = { status: 'REQUEST_FAILED', message: [`BLS didn't answer: ${err.message}`] };
        }

        if (data.status !== 'REQUEST_SUCCEEDED') {
            const message = (data.message ?? []).join(' ') || 'BLS request did not succeed';
            for (const i of batch) records[i].error = `${message} You weren't charged for this lookup.`;
            serviceErrors += batch.length;
            continue;
        }

        for (const i of batch) records[i].billable = true;
        for (const series of data.Results?.series ?? []) {
            const latest = series.data?.[0];
            if (!latest) continue;
            for (const { i, field } of fieldsBySeries.get(series.seriesID) ?? []) {
                records[i][field] = Number(latest.value);
                records[i].found = true;
                records[i].dataYear = latest.year;
            }
        }
    }

    return { records, serviceErrors };
}
