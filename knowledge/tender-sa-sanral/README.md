# Tender SA / SANRAL knowledge pack

Bundled method and depth standards for Agent Pi tender workbench.

**Profile id:** `sa-sanral-highway` (see `../profiles.json`).  
New projects default to `generic-international` (`../tender-generic/`); select this profile when the bid is SANRAL / COTO / C5.1 highway work.

| File | Role |
| --- | --- |
| `../tender-generic/analysis_suite_depth.md` | Document-analysis depth bar (shared; do not copy N2-18 facts into a new bid) |
| `C5.1_路床_单价推导.md` | BOQ five-step pure direct-cost method & depth standard |
| `N2-18施工策划报告_R05修订版.md` | Construction methodology report TOC/depth standard |
| `N2-18-Work_Plan_and_Proposed_Methodology.docx` | Formal Work Plan submission template |
| `S-Curve_Cash_Flow_Chart.html` | Cash-flow S-curve chart template |
| `Attachment2_Plant_Histogram_R00.pdf` | Plant histogram style reference |
| `Attachment3_Labour_Histogram_R00.pdf` | Labour histogram style reference |

These files constrain **structure, method, and presentation depth**. Project facts must come from the current project's registered tender sources. Projects may override any path via `.agent-pi/business/tender/<projectId>/bindings.json`.
