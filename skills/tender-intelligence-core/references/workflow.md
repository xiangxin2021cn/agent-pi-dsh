# Tender Intelligence Workflow

## 1. Confirm The Source Boundary

List the documents the user selected, attached, or explicitly identified for registration. Confirm whether addenda, templates, drawings, BOQ files, and supporting evidence are included. Do not infer that every file beneath the working directory is in scope.

If the source set, document precedence, revision status, or governing interpretation is unclear, stop the affected analysis and ask the user to resolve it. Continue only with unaffected facts whose source basis is unambiguous.

## 2. Initialize And Register Sources

Call `tender_workspace` with `init` for the project. Register each in-scope document with `upsert_documents` before extracting business facts from it. Record revisions, addenda, status, and supersession explicitly; never replace source history with an informal note.

## 3. Extract Requirements And Criteria

Read only the registered source set. For each requirement or criterion:

- capture the smallest useful exact locator;
- distinguish mandatory, qualification, technical, contractual, pricing, deadline, format, and evaluated requirements;
- distinguish pass/fail, threshold, and weighted criteria;
- retain uncertainty as an explicit gap;
- use `upsert_requirements` or `upsert_criteria` only after its cited document exists in the workspace.

Do not summarize a document into requirements without retaining traceability to the registered source.

## 4. Register Deliverables And Responses

Use `upsert_deliverables` to register each required submission item, format, section, due time, template reference, and linked requirements. Use `upsert_responses` to connect requirements and criteria to one deliverable, response section, evidence, owner, and lifecycle status.

Narrative mention alone does not cover a mandatory requirement. Coverage must be represented by a valid response plan or an explicitly accepted non-document response supported by the data model.

## 5. Validate And Report

Call `validate` after mutations and before any completion claim. Use `status` when a current workspace summary is needed without mutation. Report readiness, material audit issues, unresolved ambiguities, and the returned model and audit paths.

Do not claim that `ready` predicts award or substitutes for professional approval. Do not hand downstream capabilities facts that lack stable workspace IDs and source locators.

## 6. Write For This Tender

Every customer-facing Markdown, DOCX, programme narrative, and stage summary must follow [writing-contract.md](writing-contract.md): use the employer's terms and returnable shape; strip AI filler; do not substitute a generic construction essay for this bid's constraints.
