# Site-bound productivity diligence

Daily output is not a national constant. The same grader-and-roller gang does not produce the same m³/day in eThekwini rain, Highveld frost, Karoo haul, or a night-shift possession. Copying the C5.1 illustration (`2,500 m³/天`, `0.25` weather factor) or a **Chinese** highway norm / plant brochure is a pricing error.

Write `当地工效尽调.md` in `Agent Pi Outputs/<projectId>/boq-pricing/` before `complete_stage`. It is part of the same hard gate as the supplier pack. If local pages and RFQs cannot be completed, `tender_evidence waive_pricing` plus `组价依据说明.md` may release the stage — planning then uses **derived** outputs and must keep that label.

## Ladder (do not skip rungs)

0. **Enterprise file first.** If the user registered a productivity workbook or memo at project setup (file name contains 工效 / productivity / 日产 / production rate), copy those outputs into `planningBasis.productionRate`. They outrank web pages. Do not overwrite an enterprise number with AnySearch. Search only the operations the file does not cover.
1. **Human-reviewed project numbers.** If the user later edits daily output or a key resource rate in the chapter Markdown and confirms global adjust, those values become this tender’s reviewed ledger. They outrank later web research for the same resource.
2. **This site first.** Read `项目特征.md`: province, metro, corridor, working hours, rainy months, haul, lane possession, testing hold points, local-labour rules.
3. **`anysearch_capabilities`.** Copy live `tag` / `params`. Do not guess.
4. **Local batch** (`anysearch_batch_search`, max five, every item `zone: "intl"`, `language: "en"`). Fill `{site}` from the characteristic memo:

   - `{metro or corridor} road earthworks daily production grader roller compaction`
   - `SANRAL {province} method statement production rate earthworks`
   - `{province} rainy season roadworks downtime days per month`
   - `{metro} dump truck haul cycle time {N} km commercial source`
   - `{metro} civil plant hire output padfoot smooth drum excavator`

5. **`anysearch_search`** with a catalogue company / local-business tag, or `web_fetch` the official PDF. A rate enters the pack only after the page is opened. Record `url` + `accessedAt`.
6. **International adjustment — only after local search fails.** If no opened page gives a usable output, take a published international handbook figure (Caterpillar Performance Handbook, OEM spec sheet, recognised English-language civil estimating text) and **re-derive** it with this site’s hours, rain, haul cycle, possession, and testing downtime. Mark `assumptionStatus: unverified` and source `international_adjusted`.
7. **Never start from China.** Do not use 公路工程预算定额, 全国统一施工机械台班, or a Chinese OEM domestic-site brochure as the primary output. Those crews, hours, and weather are not this contract.

Repeat the batch for the controlling operation of each priced item (compaction, cut, rock, lime, import haul). One default m³/day for the whole chapter is not diligence.

## What to write on each item

On `productivityBasis` / `planningBasis`:

| Field | Rule |
|---|---|
| `workingHoursPerDay` | Contract / possession hours from 项目特征 — do not invent 8.3 |
| `theoreticalProductionRate` | Width × speed × hours ÷ passes (or cycle time), shown in the formula |
| Effective factor | Local rain, watering, testing, haul, night-shift ban — not the C5.1 `0.25` |
| `planningBasis.productionRate` | Equals the **base** scenario |
| Source label in the memo | `local_verified` if an opened local page supports the number; else `international_adjusted` |
| `sourceRefs` / `webEvidence` | url + accessedAt; unopened pages stay unverified |

Optimistic / base / pessimistic stay in the same unit. Duration must cover the BOQ quantity at the base rate.

## Memo (`当地工效尽调.md`)

1. Site string and the site facts that move output.
2. AnySearch log (capabilities → each batch/search, zone, tag, url, date).
3. Table of operations: local hit / no local hit / international source × which local factor.
4. Explicit line: Chinese norms were not used.
5. Which items remain `international_adjusted` for planning.

Do not invent a published local output. Do not paste a Durban rain factor onto a Free State site.
