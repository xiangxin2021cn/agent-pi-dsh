# BOQ unit-cost workbook layout

Use this note when generating or editing `BOQ 组价测算.xlsx`. It records the **internal organisation** of the factory unit-cost analysis book (one sheet per BOQ item). Do not copy project names, quantities, or rates from any exemplar.

The generator is `tender_pricing_workbook generate`. A blank demonstration file lives beside this note: `boq_unit_cost_analysis_template.xlsx`.

## Workbook

| Sheet | Role |
| --- | --- |
| Summary | All priced items: quantity (blue input), RATE `=Item!E3`, AMOUNT `=D*E`, bottom SUM |
| Rates | Currency, default hours/day, VAT factor, profit fraction (default `0` so the item RATE is pure direct cost) |
| One sheet per BOQ code | Unit-cost analysis for that item |

## Item sheet

1. Title row: `BOQ ITEM UNIT COST ANALYSIS…` (merged A1:F1)
2. Header: `BOQ ITEM | DESCRIPTION | UNIT | QUANTITY | RATE`
3. Identity row: code, description, unit; `D3=1` (this page is a **unit** analysis). The BOQ quantity belongs on Summary.
4. Yellow `H2` = daily output; `H3` = hours per day. Quantity formulas that encode daily output must reference `$H$2`.
5. Analysis conditions (working hours, daily output, haul, waste)
6. Present only the blocks that have rows:
   - `Cost of materials` (M…)
   - `Cost of fuel` (F…)
   - `Cost of machinery` (C…)
   - `Cost of labor` (L…)
   - `Management fees and other expenses` (A…)
7. Each resource row: `ITEM | DESCRIPTION | UNIT | QUANTITY | UNIT COST | TOTAL` with `F=D*E`
8. Block subtotal: `=SUM(F…)`
9. `TOTAL COST (Excluding VAT)` = sum of block subtotals
10. `PROFIT` = total × `Rates!$B$5` (C5.1 default 0)
11. `PRICE` = total + profit; header `E3` `=PRICE` so Summary RATE follows edits

Blue / yellow cells are inputs. Black formula cells must stay formulas. Do not keep broken external links such as `[1]在用机械…`; owned-plant rates belong on Rates or as a typed unit cost on this sheet.

## Kind mapping from the pricing pack

| Pack `kind` | Block |
| --- | --- |
| material, waste | Cost of materials |
| diesel / fuel / litres heuristics | Cost of fuel |
| plant | Cost of machinery |
| labour | Cost of labor |
| subcontract, overhead, transport (non-fuel), other | Management fees and other expenses |
