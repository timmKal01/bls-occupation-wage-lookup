# BLS Occupation Wage Lookup: National & State Pay Data

Give it an occupation's SOC code. Get back official U.S. Bureau of Labor
Statistics wage and employment data, nationally or for a specific state,
straight from the Occupational Employment and Wage Statistics (OEWS)
survey.

## Who this is for

- **HR and recruiting teams** benchmarking a role's compensation against national or state pay data before making an offer.
- **Compensation analysts** building pay bands grounded in official government data instead of self-reported salary sites.
- **Researchers and journalists** covering labor market and wage trends by occupation and state.

## Input

| Field | Type | Description |
|---|---|---|
| `occupations` | array | `[{ "socCode": "15-1252", "stateCode"?: "TX" }]`. `socCode` is the 6-digit Standard Occupational Classification code, find yours at [bls.gov/soc](https://www.bls.gov/soc/). O*NET-style codes like `"15-1252.00"` work too, and a plain list of codes (`["15-1252", "29-1141"]`) is fine. Omit `stateCode` for national data, or give a two-letter code (`"TX"`) or the state's name (`"Texas"`). |
| `apiKey` | string (optional) | Free registration key from [bls.gov/developers](https://www.bls.gov/developers/), raises the daily request limit and historical range. Not required for small batches. |

```json
{
  "occupations": [
    { "socCode": "15-1252" },
    { "socCode": "15-1252", "stateCode": "TX" }
  ]
}
```

## Output

One record per occupation lookup:

```json
{
  "socCode": "15-1252",
  "stateCode": null,
  "found": true,
  "annualMeanWage": 148100,
  "employment": 1687890,
  "hourlyMeanWage": 71.2,
  "annualMedianWage": 135980,
  "hourlyMedianWage": 65.38,
  "dataYear": "2025",
  "checkedAt": "2026-09-19T12:00:00.000Z"
}
```

Fields come back as `null` if that specific measure has no data available
for the requested occupation/area combination (common for niche
occupations or small states), `found` is `false` if none of the requested
measures returned data at all.

An entry that can't be looked up doesn't stop the run. It comes back with
`found: false` and an `error` that says what to fix, for example a job
title instead of a SOC code, or a state that doesn't exist. The other
lookups in the same run carry on as normal.

## How it works

Direct calls to the official BLS Public Data API's OEWS series, no
scraping, no proxy. Each request builds the OEWS series ID for employment,
annual mean wage, annual median wage, hourly mean wage, and hourly median
wage, and fetches them in batched calls of up to 5 occupation/area
lookups each (10 with a registration key).

**Rate limits:** unregistered use is capped at 25 series requests per day
and 10 years of history. A free registration key (see Input above) raises
that to 500 requests per day with a longer history window.

## Pricing note

Billed per **occupation lookup**, not per wage field returned: one charge
per `socCode`/`stateCode` pair that BLS answers, whether all five wage
measures come back populated or several are `null` for that
occupation/area. Entries with an `error` (input that isn't a valid code or
state, or a lookup BLS refused, for example once its daily limit is used
up) are never charged.

## Related products

- [US Labor Market Indicator Lookup](https://github.com/timmKal01/us-labor-market-indicator-lookup) — broader BLS labor market indicators, not scoped to a single occupation's pay
