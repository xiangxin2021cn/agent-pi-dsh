# Primavera P6 XML Reference

This reference is based on live inspection of:

`E:\南非项目\投标项目\Namibia\纳米比亚硫酸厂项目\P6_Rev6_MasterRev1_Civil_ResourceSmoothed.xml`

## Observed Structure

- Size: 735,759 bytes.
- Root: `APIBusinessObjects`.
- Namespace: `http://xmlns.oracle.com/Primavera/P6/V8/API/BusinessObjects`.
- Counts:
  - `Calendar`: 1
  - `Project`: 1
  - `WBS`: 65
  - `Activity`: 406
  - `Relationship`: 520
  - `ActivityCode`, `ActivityCodeType`, `ActivityCodeAssignment`, `Resource`, `Role`: 0

The sample is a useful baseline for construction programme generation because it is lean: it imports the planning structure, calendar, activities, and relationships without requiring resource dictionaries or activity code dictionaries.

## Calendar Pattern

The sample uses one project calendar:

- `ObjectId`: 1001
- `Name`: `7-Day Workweek`
- `Type`: `Project`
- `HoursPerDay`: 8
- `HoursPerWeek`: 56
- `WeekStartDay`: Monday
- Standard work week: all seven days, 07:30 to 15:29.

Use a similar single project calendar unless the source explicitly requires multiple calendars.

## Project Fields

Required or useful fields observed:

- `ObjectId`
- `Id`
- `Name`
- `Status`
- `CalendarObjectId`
- `DataDate`
- `StartDate`
- `PlannedStartDate`
- `FinishDate`
- `PlannedFinishDate`
- `MustFinishByDate`

Sample values:

- `Id`: `NAM-SA`
- `Name`: `Sulfuric Acid Plant EPC Project in Namibia - Master Rev1 Civil Replaced Rev4`
- `Status`: `Planned`
- `DataDate` and `StartDate`: `2026-10-08T07:30:00`
- `MustFinishByDate`: `2029-03-14T16:00:00`

## WBS Pattern

WBS entries use numeric `ObjectId`, text `Code`, text `Name`, and optional `ParentObjectId`.

Sample hierarchy:

| ObjectId | Code | Name | ParentObjectId |
| --- | --- | --- | --- |
| 2000 | ROOT | Sulfuric Acid Plant EPC Project in Namibia | |
| 2001 | MILE | Key Milestone | 2000 |
| 2002 | ENG | Detail Engineering | 2000 |
| 2003 | ENG.PROC | Process | 2002 |
| 2004 | ENG.ROT | Rotating Equipment | 2002 |
| 2005 | ENG.STAT | Static Equipment | 2002 |
| 2006 | ENG.CSA | Civil / Structural / Architectural | 2002 |
| 2016 | PROC | Procurement | 2000 |

Generation rule:

- Keep WBS codes short and stable.
- Use dot notation for hierarchy where helpful.
- Do not rely on display order alone; set `ParentObjectId` correctly.

## Activity Pattern

Normal work activity fields observed:

- `ObjectId`
- `ProjectObjectId`
- `WBSObjectId`
- `CalendarObjectId`
- `Id`
- `Name`
- `Type`
- `Status`
- `DurationType`
- `PercentCompleteType`
- `PlannedDuration`
- `RemainingDuration`
- `AtCompletionDuration`
- `StartDate`
- `FinishDate`
- `PlannedStartDate`
- `PlannedFinishDate`
- `RemainingEarlyStartDate`
- `RemainingEarlyFinishDate`
- `RemainingLateStartDate`
- `RemainingLateFinishDate`
- `IsCritical`
- `Notebook`
- `PrimaryConstraintType`
- `PrimaryConstraintDate`

Activity type counts in the sample:

- `Task Dependent`: 383
- `Finish Milestone`: 19
- `Start Milestone`: 4

Normal task example:

- `ObjectId`: 3021
- `Id`: `E1000`
- `Name`: `PDP study`
- `Type`: `Task Dependent`
- `Status`: `Not Started`
- `PlannedDuration`: 24
- `Notebook`: `Predecessors in source PDF: A1020`

Generation rules:

- Use `Task Dependent` for normal construction work.
- Use zero-duration `Start Milestone` or `Finish Milestone` only for contractual milestones.
- Keep source explanations in `Notebook` when the schedule is derived from tender documents.
- Keep date fields internally consistent. If only a duration is known, calculate dates from the neutral schedule model before writing XML.

## Relationship Pattern

Observed relationship fields:

- `PredecessorActivityObjectId`
- `SuccessorActivityObjectId`
- `Type`
- `Lag`

Relationship counts:

- `Finish to Start`: 517
- `Start to Start`: 3

Generation rules:

- Use `Finish to Start` by default.
- Use `Start to Start` only for intended overlap.
- Keep `Lag` numeric. Use 0 unless the source or planning logic requires lag.
- Every predecessor and successor must point to an existing activity `ObjectId`.

## Validation Checklist

- XML parses with namespace-aware parsing.
- One project calendar is present and referenced by project and activities.
- One root WBS exists.
- All WBS parent references resolve.
- All activity `ObjectId` and `Id` values are unique.
- All activity `WBSObjectId` references resolve.
- All relationship endpoints resolve to activities.
- Milestones have zero duration.
- Source assumptions are captured in `Notebook` or the validation report.

