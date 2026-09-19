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
| `occupations` | array | `[{ "socCode": "15-1252", "stateCode"?: "TX" }]`. `socCode` is the 6-digit Standard Occupational Classification code, find yours at [bls.gov/soc](https://www.bls.gov/soc/). Omit `stateCode` for national data, or use a two-letter USPS code for state-level data. |
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

## How it works

Direct calls to the official BLS Public Data API's OEWS series, no
scraping, no proxy. Each request builds the OEWS series ID for employment,
annual mean wage, annual median wage, hourly mean wage, and hourly median
wage, and fetches all five in one batched call per occupation/area.

**Rate limits:** unregistered use is capped at 25 series requests per day
and 10 years of history. A free registration key (see Input above) raises
that to 500 requests per day with a longer history window.

## Related products

- [US Labor Market Indicator Lookup](https://github.com/timmKal01/us-labor-market-indicator-lookup) — broader BLS labor market indicators, not scoped to a single occupation's pay
