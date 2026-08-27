# Tender Workspace Data Model

The Tender Workspace is the project-local system of record. Use stable IDs and registered tool actions; do not maintain a competing model in chat, scratch files, or copied source text.

## Documents

Register every source before citing it. Preserve its kind, path, revision metadata, lifecycle status, and supersession links. Addenda and revisions are separate, explicit registrations. A superseded document remains traceable but must not support a current conclusion without review.

## Exact Source Locators

Every requirement and evaluation criterion must cite a registered document ID and the most precise available location. Include applicable locator fields such as page or sheet, clause or section, cell or range, MinerU block ID, bounding box, and a short exact excerpt.

Locators establish traceability; they are not permission to reproduce a complete licensed standard or tender document.

## Requirements And Criteria

Classify requirements explicitly and preserve criticality, required evidence, owner, status, and affected entities. For criteria, preserve the assessment method, weight or threshold where applicable, linked requirements, evidence expectations, source locator, and response status. Weight is structured data, not narrative.

## Deliverables And Responses

Deliverables define the required output, format, submission section, due time, template path, linked requirements, and status. Response plans connect requirements and criteria to a deliverable, response section, evidence locators or artifact paths, owner, and lifecycle status.

When a requirement is genuinely satisfied outside a document deliverable, omit `deliverableId` only after human acceptance and set `nonDocumentResponseAccepted: true`. Narrative explanation alone does not establish this exception.

All referenced IDs must already exist. If an upsert fails cross-entity validation, correct the missing or incorrect entity and retry; never persist partial or invented links.
