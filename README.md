# Salary Data by Occupation: BLS Wages by State

Salary benchmarking data for recruiters, HR teams and compensation
analysts. Pick a job and get back what it pays in the U.S.: mean and
median annual salary, hourly wage, and how many people work in it,
nationally or in any state.

The figures are the official U.S. Bureau of Labor Statistics salary
statistics from the Occupational Employment and Wage Statistics (OEWS)
survey, which collects pay data from employers, not from self-reported
salary sites.

## What you get

One row of salary statistics per job and location:

- Mean and median annual salary
- Mean and median hourly wage
- Employment: the estimated number of people employed in that job
- The year the figures come from

## Who this is for

- **Recruiters** checking what a role pays in a state before making an offer or advising a client.
- **HR and compensation teams** building salary bands and pay ranges from official government data.
- **Job boards and career sites** showing typical pay for a job, or comparing it across states.
- **Researchers and journalists** covering wages by occupation and state.

## Input

Each job is identified by its SOC code (Standard Occupational
Classification), the code the U.S. government uses for every occupation.
Find any job's code at [bls.gov/soc](https://www.bls.gov/soc/). Some
common ones:

| Job | SOC code |
|---|---|
| Software developers | `15-1252` |
| Registered nurses | `29-1141` |
| Accountants and auditors | `13-2011` |
| Human resources specialists | `13-1071` |
| General and operations managers | `11-1021` |
| Customer service representatives | `43-4051` |
| Heavy and tractor-trailer truck drivers | `53-3032` |
| Retail salespersons | `41-2031` |

| Field | Type | Description |
|---|---|---|
| `socCode` + `stateCode` | string | Shortcut for a single job: `"15-1252"`, plus an optional state. |
| `occupations` | array | Several jobs in one run: `[{ "socCode": "15-1252", "stateCode"?: "TX" }]`. O*NET-style codes like `"15-1252.00"` work too, and a plain list of codes (`["15-1252", "29-1141"]`) is fine. Omit `stateCode` for national data, or give a two-letter code (`"TX"`) or the state's name (`"Texas"`). |
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
  "rowType": "wage",
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

`rowType` is `"wage"` for every lookup BLS answered, including one it has no data for (`found: false`), and `"error"` for an entry with an `error`.

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
