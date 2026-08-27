# Candy Planning And CCS Backup Reference

This reference is based on both official RIB Candy exchange guidance and live inspection of:

`E:\南非项目\投标项目\South Africa\N2 high way\Submit documents\!47967_!12827_SANRAL_Route_N2_section_18_tender_V01~03_Planning_Program.CCS.ccs_tmp`

## Official Import Route

Official RIB Candy data exchange documents describe importing planning programmes through Candy Planning's General Importer:

- P6 to Candy: `https://www.rib-software.com/pdf/en/data-exchange-candy-primavera.pdf`
- Microsoft Project to Candy: `https://www.rib-software.com/pdf/en/data-exchange-candy-ms-project.pdf`

Important points from those official documents:

- Candy imports Primavera P6 XML through Program Manager, `Tools > Import > General importer`.
- Candy imports Microsoft Project XML through Program Manager, `Tools > Import > General importer (XML ...)`.
- For Primavera P6 XML, Candy imports WBS, activity ID, descriptions, durations, start/end dates, and precedence logic, but not resources.
- For Microsoft Project XML, Candy imports start date, multiple calendars with exceptions, summary headers as indented tasks, activity ID into Candy's Import reference column, descriptions, durations, start/end dates, and precedence logic.
- For Microsoft Project XML, Candy does not import resources or resource calendars.
- Candy displays an analysis report after import. Treat this report as the final import validation evidence.

## Observed `.ccs_tmp` Container

The sample file is not XML or CSV.

Observed facts:

- File size: 333,824 bytes.
- A Microsoft Cabinet `MSCF` signature starts at byte offset 4096.
- Extracting from byte offset 4096 produces a CAB stream.
- The CAB lists one file named `BACKUP.DAT`.
- Expanding the CAB produces a binary body of about 4,477,868 bytes.
- The body contains readable markers but is not a clean text database.

Readable markers in the expanded binary body:

- `SANRAL Route N2 section 18 tender V01.03`
- `Tender Programs`
- `C:\Users\Bradley\Documents\CCS Data Bases\CCS Data 2\COY_A\JOB_40\SITEPLAN\A-__05*.A40`
- `[Contract Dates]`
- `Start Activity=0`
- `End Activity=0`
- Activity numbers and names such as:
  - `0167 Obtain Aggregate specifications`
  - `1040 Foundation Formwork`
  - `0003 Contractual Documentation`
  - `0106 Road Agency Approval`
  - `0171 Offices and Laboratory`
  - `0213 Structures Completion Dates Excluding Snagging and Terminal Float`

Interpretation:

- `.ccs_tmp` is a Candy backup or temporary backup container.
- Its embedded SitePlan data appears to reference many internal `A-__05*.A40` fragments.
- The format is proprietary and binary. It is not safe to generate native Candy backups by guessing byte structure.

## V1.2 Feasible Implementation

For production-quality V1.2 output:

1. Generate a neutral schedule model.
2. Export P6 XML or Microsoft Project XML.
3. Tell the user to import that XML in Candy through Program Manager > Tools > Import > General importer.
4. Ask for Candy's analysis report or a re-exported Candy backup if exact compatibility must be verified.

This route is documented by RIB and does not require reverse engineering Candy's proprietary backup internals.

## Native Candy Research Track

Native `.ccs`, `.ccs_tmp`, or SitePlan backup generation should be treated as experimental until validated in Candy.

A safe research path:

1. Collect multiple Candy planning backups from known schedules.
2. Extract the embedded CAB stream and expanded binary body.
3. Identify repeatable section boundaries, activity records, date encodings, link records, calendar records, and checksums.
4. Make one minimal controlled change inside Candy, export again, and binary-diff the backups.
5. Generate a minimal backup from a template only after the changed fields are understood.
6. Import/open the generated backup in Candy and capture the analysis/open result.

Do not ship native Candy backup writing before this round-trip validation exists.

## Validation Checklist

For Candy-compatible XML:

- XML validates under the P6 or Microsoft Project rules.
- The validation report states that the file is intended for Candy General Importer.
- The output summary states that resources may not be imported from Microsoft Project XML.
- Actual Candy import remains unverified unless Candy's analysis report has been captured.

For native Candy backup research:

- Preserve the original backup before any experiment.
- Work on copies only.
- Record byte offsets and extracted sections.
- Do not overwrite user-supplied Candy files.
