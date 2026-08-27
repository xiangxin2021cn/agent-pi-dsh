# Microsoft Project XML Reference

This reference is based on live inspection of:

`E:\南非项目\投标项目\Namibia\温得和克医院\温得和克医院\投标过程资料\WHK_Hospital_Master_Programme_Contract_Calendar_Manual.xml`

## Observed Structure

- Size: 142,238 bytes.
- Root: `Project`.
- Namespace: `http://schemas.microsoft.com/project`.
- Counts:
  - `Calendar`: 1
  - `Task`: 99
  - `Resource`: 47
  - `Assignment`: 0
  - `PredecessorLink`: 102
  - `ExtendedAttribute`: 0
  - `OutlineCode`: 0

The sample is useful because it is simple and import-oriented: it contains tasks, summary hierarchy, calendars, notes, resources, and links, but no assignments.

## Project Fields

Observed project-level fields:

- `SaveVersion`: 14
- `Name`
- `Title`
- `Company`
- `Manager`
- `ScheduleFromStart`: 1
- `StartDate`
- `FinishDate`
- `CalendarUID`
- `DefaultStartTime`
- `DefaultFinishTime`
- `MinutesPerDay`
- `MinutesPerWeek`
- `DaysPerMonth`

Sample defaults:

- `StartDate`: `2026-09-01T08:00:00`
- `FinishDate`: `2027-08-31T17:00:00`
- `DefaultStartTime`: `08:00:00`
- `DefaultFinishTime`: `17:00:00`
- `MinutesPerDay`: 480
- `MinutesPerWeek`: 3360

## Calendar Pattern

The sample has one calendar named `Seven-Day Construction Calendar`.

Each day has two working intervals:

- 08:00 to 12:00
- 13:00 to 17:00

Use a single seven-day construction calendar when the source does not provide holidays or different resource calendars.

## Task Pattern

Summary task example:

- `UID`: 1
- `ID`: 2
- `Name`: `Phase 1: Mobilisation`
- `WBS`: `1.1`
- `Summary`: 1
- `Duration`: `PT200H0M0S`

Leaf task fields observed:

- `UID`
- `ID`
- `Name`
- `Manual`
- `Type`
- `IsNull`
- `WBS`
- `OutlineLevel`
- `Start`
- `Finish`
- `Duration`
- `ManualStart`
- `ManualFinish`
- `ManualDuration`
- `StartText`
- `FinishText`
- `DurationText`
- `DurationFormat`
- `Estimated`
- `Milestone`
- `Summary`
- `Critical`
- `FixedCostAccrual`
- `PercentComplete`
- `PercentWorkComplete`
- `ActualDuration`
- `RemainingDuration`
- `Notes`

Leaf task example:

- `UID`: 2
- `ID`: 3
- `Name`: `Contract Signing & Insurance`
- `WBS`: `1.1.1`
- `OutlineLevel`: 3
- `Start`: `2026-09-01T08:00:00`
- `Finish`: `2026-09-05T17:00:00`
- `Duration`: `PT40H0M0S`
- `DurationText`: `5 days`
- `Summary`: 0
- `Notes`: `Sched 1: N$760,000 PS - Contract establishment, bonds, insurance`

Generation rules:

- Write WBS phase headings as summary tasks.
- Write work items as leaf tasks with `Summary` 0.
- Use `Notes` for source basis, quantities, BOQ schedule references, and assumptions.
- Avoid predecessor logic on summary tasks.
- Use zero duration for milestones.

## PredecessorLink Pattern

The sample has 102 predecessor links:

- Type `1`: 77 observed links, used as Finish-to-Start in this sample.
- Type `3`: 25 observed links, used for overlap logic in this sample.

Generation rules:

- Use Type `1` for normal Finish-to-Start logic.
- Use Type `3` only when a Start-to-Start style overlap is intended.
- Always reference predecessor task `UID`, not display `ID`.
- Keep lag out unless required; if using lag, document the assumption.

## Resource Pattern

The sample has resources but no assignments.

Resource examples:

- `Project Manager`
- `Site Agent`
- `Earthworks Foreman`
- `Concrete Foreman`
- `Roads Foreman`
- `Surveyor`
- `HSE Officer`
- `Quality Manager`
- `D8 Dozer`
- `Excavator 320`
- `Tipper Truck`
- `Concrete Pump`

Generation rules:

- Include resources as reference dictionaries only when useful.
- Do not add assignments unless the user requests a resource-loaded programme and provides production logic.
- If generating a Candy-compatible MS Project XML, remember Candy's documented import path does not import resources from MS Project XML.

## Validation Checklist

- XML parses with namespace-aware parsing.
- The project contains a calendar and tasks collection.
- Task `UID` values are unique.
- Leaf task predecessor links reference existing `UID` values.
- Summary tasks have children by WBS/outline hierarchy.
- Milestones have zero duration.
- Resource dictionaries do not imply resource loading unless assignments exist.

