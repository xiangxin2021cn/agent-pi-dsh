# Local supplier diligence and bilingual RFQs

The BOQ pricing stage must leave the estimator a **usable inquiry pack**, not only web-verified unit rates. After the item workpapers, write two Official Outputs in `Agent Pi Outputs/<projectId>/boq-pricing/`:

1. `当地供应商尽调.md` — local material and plant suppliers for **this** site.
2. `询价单总表.md` plus one bilingual RFQ per inquired resource under `询价单/`.

These files, together with `当地工效尽调.md`, are a stage hard gate. `complete_stage` is refused without them **unless** the user force-passes the pricing pack.

## Force-pass when the pack cannot be completed

If supplier contacts or local productivity pages are not available in time:

1. Call `tender_evidence` `waive_pricing` (or `tender_stage` `force_pass` with `stageId=boq-five-step-pricing`). Characteristic `waive` / `force_pass` does **not** unlock this pack.
2. Write `组价依据说明.md` in the same folder. State that planning will use **web quotes and derived productivity**, not a supplier reply; list the missing files; keep gaps labelled.
3. `planningBasis` and the planning stage must repeat that note. When a real quote arrives, replace the derived rate.

Do not silently treat a webpage scrape as an awarded hire rate.

## Diligence memo (`当地供应商尽调.md`)

Open with the site string from `项目特征.md` (province, metro, corridor, haul). Then:

1. **AnySearch log.** List every `anysearch_capabilities` / `anysearch_search` / `anysearch_batch_search` / `web_search` / `web_fetch` call: query, `zone`, `tag` if any, URL, `accessedAt`.
2. **Market notes.** What the local search actually showed for diesel, water, plant hire, aggregates, lime/cement, and specialized plant. Unopened pages stay unverified.
3. **Supplier register** — one row (or heading) per company:

   | Field | Rule |
   |---|---|
   | Name, town / depot | From the page, not memory |
   | What they can quote | Plant wet/dry, G2/G5, diesel bulk, lime, … |
   | Phone, email, website | Copy from the fetched page. If the page has no email, write `未公开` and keep the URL |
   | Source | `url` + `accessedAt` |
   | Fit | Distance to site, SANRAL / CIDB mention if present |

4. **Inquiry list.** Which BOQ resources still need a human RFQ (no published rate, hire-only, imported material, specialized plant).

Do not invent a phone number or email. Do not paste a Chinese trader as a KZN supplier. Do not copy names from the C5.1 illustration.

## RFQ index and files

`询价单总表.md` is the estimator’s cover sheet: resource, specification, quantity, unit, preferred suppliers, RFQ file name, status (`草稿` / `待发出` / `已回`).

Each file `询价单/RFQ-<nn>-<stem>.md` is **Chinese then English**, same facts, so the South African supplier can answer without a translator. Required blocks in both languages:

- Project name, employer, site / delivery point, requested reply date
- Item specification (COTO / material class / plant model or equivalent)
- Quantity, unit, delivery window, Incoterms or “delivered to site”
- What the quote must show (ZAR exclusive of VAT, hourly/daily/ex-works, wet vs dry, operator included or not)
- Bidder contact for questions

One RFQ per inquired resource (diesel, padfoot, G5, lime, …). Do not put twenty plant types on one sheet.

## Tool order for contacts

1. `anysearch_capabilities` — see whether a company / local-business tag exists.
2. `anysearch_batch_search` (`zone: "intl"`, `language: "en"`) for the five supplier queries in [local-site-intel.md](local-site-intel.md).
3. `anysearch_search` with the catalogue `tag` plus `includeContent: true` on the shortlisted company page.
4. `web_fetch` the official contact page. Phone and email enter the diligence table only after this step.

If the web has no contact, the RFQ still goes out as a template addressed to “To the quotations desk” with the source URL in a note. Status stays `待发出`.
