# South Africa civil / highway labour rates

South African construction wages are not a single “average daily rate”. They differ by bargaining-council grade, province/area, local-labour clauses, and whether the operator sits in a wet-hire plant rate. Do not reuse Chinese, US, or EU construction wages. Do not copy the rand figures in the bundled C5.1 路床 exemplar — those are one old workpaper, not this tender’s rate file.

AnySearch is the search backend for `web_search`. For wages, prefer the advanced tools so the query stays in the international zone.

## Source ladder (this tender)

1. **Contract first.** If Particular Conditions, Pricing Instructions, or a returnable schedule a published labour rate, community rate, or EPWP rate, that rate wins for the people it covers. Cite `[src:…]`.
2. **BCCEI (Bargaining Council for the Civil Engineering Industry).** Default market schedule for civil / road crews: general worker, flagman, plant operator grades, artisan, leading hand / foreman. Search the **current** wage determination, not last year’s memory.
3. **National Minimum Wage (NMW)** from the Department of Employment and Labour gazette. This is a **floor** for unskilled / community labour. It is not the operator or artisan rate.
4. **Tender-specific local labour.** SANRAL and provincial roads often require a percentage of local / targeted labour at a community or EPWP rate. Do not price those people on BCCEI artisan grades, and do not price a grader operator on the community rate.
5. If a published schedule cannot be opened, keep `assumptionStatus: unverified`. Never invent a rand/hour.

## Grades to price separately

Price each grade that the crew actually uses. A single “labour R/day” line is not enough.

| Role | Typical source | Do not |
|---|---|---|
| General worker / labourer | BCCEI task grade, or NMW if the contract says so | Use a Chinese 普工 day-rate |
| Flagman / traffic control | BCCEI or contract traffic-management rate | Reuse the general-worker rate without a source |
| Plant operator | BCCEI operator grade, unless wet-hire already includes the driver | Double-count inside a wet plant rate |
| Artisan | BCCEI artisan grade | Use NMW |
| Foreman / leading hand | BCCEI supervisory grade | Copy the C5.1 exemplar foreman day-rate |

If plant is **wet hire**, the operator is usually inside the plant rate — say so under labour `not_applicable` or exclude that operator from labour components. If plant is **dry hire**, price the operator on labour from BCCEI.

## AnySearch queries (mandatory on ZAR / SANRAL / COTO jobs)

Use `zone: "intl"` and `language: "en"`. Do **not** use `zone: "cn"` — that pulls PRC construction wages.

Prefer one `anysearch_batch_search` (max five items), then `web_fetch` the official pages (BCCEI, labour.gov.za, or the gazette PDF):

1. `BCCEI Civil Engineering Industry wage determination South Africa current task grades`
2. `BCCEI hourly rate general worker plant operator artisan foreman civil construction`
3. `South Africa national minimum wage current gazette Department of Employment and Labour`
4. `SANRAL contract local labour EPWP community worker wage rate` (skip if the tender has no local-labour clause)
5. `{province or metro} civil engineering wage BCCEI area schedule South Africa` using the site from `项目特征.md` (KZN, Gauteng, Western Cape, eThekwini, …)

If `anysearch_batch_search` / `anysearch_search` is not loaded, fall back to `web_search` with the same English queries plus `South Africa` / `BCCEI` in every string, then `web_fetch`.

Write each used hit on the **labour** cost component: `itemBuildUps[].costComponents[].rateBasis.webEvidence` (`url` + `accessedAt`). Put the grade name, area, and effective date in `rateBasis.note` or the component description. Currency ZAR, VAT exclusive.

## Convert published rates to the BOQ unit

- Keep the published unit (R/hour or R/day). Convert to the component unit in `calculationBasis` (hours/day from the contract calendar, not a guessed 8.3 unless the schedule says so).
- Statutory add-ons (UIF, SDL, COIDA, leave pay) may sit in an all-in labour factor if you show the factor. They are still labour direct cost, not P&G. Do not invent a 30% on-cost.
- Overtime, Sunday, and public-holiday premiums follow BCEA / the contract calendar. If the programme uses only weekday day-shift, do not load Sunday rates into the base.

## Rejected shortcuts

- Copying C5.1 路床范文工资表
- One national “South Africa construction wage” blog figure for every grade
- NMW for operators and artisans
- Chinese 建筑网 / 定额 day-rates
- Plant wet-hire plus a second operator wage for the same machine
