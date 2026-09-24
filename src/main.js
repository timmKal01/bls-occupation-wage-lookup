import { Actor, log } from 'apify';
import { fetchOccupationWages } from './bls.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { socCode: singleSocCode, stateCode: singleStateCode, occupations: occupationsInput, apiKey } = input;

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const OCCUPATION_CHECKED_EVENT = 'occupation-checked';

// The single-lookup fields exist so a Store visitor never has to touch the raw JSON
// "occupations" editor just to check one code. They take priority when filled in;
// "occupations" is for the bulk/multi-lookup case.
const occupations = singleSocCode
    ? [{ socCode: singleSocCode, stateCode: singleStateCode }]
    : (occupationsInput?.length ? occupationsInput : []);

if (occupations.length === 0) {
    throw new Error('Provide a SOC code, or use the Occupations (multiple) field.');
}

const results = await fetchOccupationWages({ occupations, apiKey });

for (const record of results) {
    await Actor.pushData({ ...record, checkedAt: new Date().toISOString() });
    await Actor.charge({ eventName: OCCUPATION_CHECKED_EVENT });
}

log.info(`Checked ${results.length} occupation lookup(s)`);

await Actor.exit();
