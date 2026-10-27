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

// An empty form still produces a useful example instead of a failed run.
if (occupations.length === 0) {
    log.info('No SOC code given, so looking up the example occupation 15-1252 (software developers).');
    occupations.push({ socCode: '15-1252' });
}

const { records, serviceErrors } = await fetchOccupationWages({ occupations, apiKey });

// Entries with bad input, or that BLS refused, are still output (with an `error` explaining why) but not charged.
for (const { billable, ...record } of records) {
    await Actor.pushData({ rowType: record.error ? 'error' : 'wage', ...record, checkedAt: new Date().toISOString() });
    if (billable) await Actor.charge({ eventName: OCCUPATION_CHECKED_EVENT });
}

const billed = records.filter((r) => r.billable).length;
log.info(`Checked ${billed} of ${records.length} occupation lookup(s)`);

if (billed === 0 && serviceErrors > 0) {
    await Actor.fail(`BLS didn't answer any lookups: ${records.find((r) => r.error)?.error ?? 'unknown error'}`);
} else {
    await Actor.exit();
}
