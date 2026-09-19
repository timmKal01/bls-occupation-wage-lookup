import { Actor, log } from 'apify';
import { fetchOccupationWages } from './bls.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { occupations = [], apiKey } = input;

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const OCCUPATION_CHECKED_EVENT = 'occupation-checked';

if (!Array.isArray(occupations) || occupations.length === 0) {
    throw new Error('Input "occupations" must be a non-empty array of { "socCode": "15-1252" } objects.');
}

const results = await fetchOccupationWages({ occupations, apiKey });

for (const record of results) {
    await Actor.pushData({ ...record, checkedAt: new Date().toISOString() });
    await Actor.charge({ eventName: OCCUPATION_CHECKED_EVENT });
}

log.info(`Checked ${results.length} occupation lookup(s)`);

await Actor.exit();
