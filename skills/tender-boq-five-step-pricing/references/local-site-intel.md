# Bind rates and productivity to this tender’s site

The bundled C5.1 路床 workpaper is a **method and depth** standard. Its rand figures, daily outputs, haul distances, and rain-season factors belong to one old N3 / eThekwini illustration. They are not this tender’s rate file.

Every labour, plant, material, water, and haul number in `itemBuildUps` must be re-derived from **this** project’s address in `项目特征.md` (province, metro, corridor, borrow/spoil, climate, working hours). If the characteristic chapter has no site, stop and mark a gap — do not reuse Durban / KZN defaults.

## What the site changes

| Fact from 项目特征 | What it moves |
|---|---|
| Province / metro / corridor | BCCEI area schedule, municipal water, diesel pump price, plant-hire catchment |
| Climate / rainy months / wind | Effective factor, watering, lime/cement windows, night-shift ban |
| In-situ class, borrow, spoil, haul km | Truck cycle, m³·km, wet vs dry hire, imported-material rate |
| Working hours / public holidays / lane possession | Hours/day in the productivity formula — do not invent 8.3 |
| Local-labour / EPWP / targeted enterprise | Which people sit on BCCEI vs the contract community rate |
| Quarry / asphalt plant / batching radius | Material ex-works + haul, not a national average |

Write the site string on every labour/plant/material `rateBasis.location` (e.g. `KwaZulu-Natal / eThekwini / N3`). Never write `South Africa average`.

## AnySearch — use the full toolset

`web_search` is the ordinary page search. For local intelligence, use the three AnySearch extensions. Do **not** guess `tag` or `params`.

1. **`anysearch_capabilities` first.** Call it with no domain to see the live catalogue, then again with any domain that looks useful for companies, maps, local business, or news. Copy `tag` / `params` **verbatim** from the response.
2. **`anysearch_search`** for one vertical hit (a named quarry, a hire depot, a gazette PDF). Pass `zone: "intl"` and `language: "en"` on South African queries. Set `includeContent: true` only when you need the page body to extract a phone or email.
3. **`anysearch_batch_search`** (max five items, all `zone: "intl"`) for independent local queries in one call. Repeat the batch if you still lack a grade, a pump price, or a supplier.
4. **`web_fetch`** the official or supplier URL before a rate enters the pack. Record `url` + `accessedAt` on `rateBasis.webEvidence`.

Never use `zone: "cn"` for South African wages, diesel, plant, or suppliers.

### First local batch (fill `{site}` from 项目特征)

1. `BCCEI Civil Engineering Industry wage determination {province} task grades`
2. `{metro or town} diesel pump price South Africa current`
3. `{metro or corridor} civil plant hire grader roller excavator wet hire`
4. `{metro} road aggregate quarry G2 G5 G7 crusher run price`
5. `{province} rainy season construction downtime roadworks`

### Second local batch (suppliers and contacts)

1. `{metro} construction plant hire contact email telephone`
2. `{metro} road aggregate supplier quarry email`
3. `{corridor or town} diesel wholesale bulk delivery construction`
4. `{metro} agricultural lime road modification supplier`
5. `SANRAL {route} approved materials source or commercial source list` (only if the tender names one)

If `anysearch_capabilities` returns a company / local-business tag, run `anysearch_search` with that tag for each shortlisted supplier instead of a generic web query.

## Productivity is local too

Read [local-productivity.md](local-productivity.md). Do not copy the C5.1 illustration `2,500 m³/天` or `0.25` weather factor. Do not apply a Chinese highway norm or domestic plant brochure.

- Search this province / metro / corridor first (`anysearch_capabilities` → `anysearch_batch_search` `zone: "intl"`).
- Theoretical output comes from width, speed, passes, and the **contract** hour.
- Effective factor comes from **this** site: rain months, watering, testing hold points, lane possession, night work, and haul.
- Only if no opened local page gives a number: international handbook × those local factors, labelled `international_adjusted`.
- Write `当地工效尽调.md`. Optimistic / base / pessimistic stay in the same unit as `planningBasis.productionRate`.
