# Attendance V1 audit — 9 September 2026

Scope: requirements comparison and responsive UI work (steps 1 and 2). This is a source audit, not production acceptance. Existing uncommitted application changes were preserved.

## Readiness

V1 is **not complete**. The main screens exist, but source inspection found broken correction writes, historical reporting gaps and missing operator permissions. Earlier descriptions of all core features being implemented were too broad: a screen or endpoint existing does not establish that its full workflow works.

## Requirements coverage

| Requirement group | Source evidence | Assessment |
| --- | --- | --- |
| Worker IDs, photos, active/inactive status, confidential details | `masters.service.js`, `photo.service.js`, `WorkersPanel.jsx` | Implemented; masters integration suite exists but was not run in this audit. |
| Designations, sheds, miscellaneous locations, supervisors and capacities | `MastersPanel.jsx`, masters models/services | Implemented. |
| Initial deployment and paginated history | `deployment.service.js`, `DeploymentPanel.jsx` | Implemented; effective-time lookup has unit coverage. Worker details displays only the first history page. |
| Face registration/re-registration and scanner | `FaceRegistrationModal.jsx`, `faceModelLoader.js`, `FaceAttendancePage.jsx` | Implemented client-side recognition; real camera and recognition accuracy acceptance pending. |
| IN/OUT, timestamps, duration and duplicate prevention | `attendance.service.js`, event/session models | Implemented core service with transaction/index protection; concurrent scan workflow still requires database and browser tests. |
| Optional scan location | `captureLocation.js`, `location.service.js`, scanner | Capture and normalization exist. Daily reports omit location results/notices despite selecting session location fields. |
| Firm/shed dashboard and present worker lists | `dashboard.service.js`, `LiveDashboardView.jsx` | Partial: single-firm view only; historical assignment and activity-date bugs below. |
| Daily/monthly reports and export | `report.service.js`, daily/monthly views | Partial: historical population, status, filters and pagination gaps below. |
| Worker attendance history | Session/event list APIs | API support exists; no dedicated browsable worker attendance history in the details UI. |
| Shed/inter-firm transfers | `transferWorker`, `TransferModal.jsx` | Transactional workflow exists; future-effective ownership and historical visibility need correction and integration coverage. |
| Attendance corrections and audit | `correctAttendanceSession`, correction and audit UI | Broken event write and additional integrity gaps; not ready. |
| Deployment corrections | Routes and deployment UI | Missing a reasoned, audited correction workflow; transfers are not a substitute. |
| Operator access and firm authorization | Attendance router, `App.jsx`, authorization helpers | Admin/developer access exists; operator permission model missing. Scanner route admits any authenticated user, while its APIs require admin. |
| Mobile/desktop usability | Attendance pages and shared controls | Responsive pass implemented below; real mobile cameras/virtual keyboards remain a field check. |

## Functional gaps, in repair order

1. **Correction workflow — critical.** `correctAttendanceSession` creates events with `createdBy`, but `AttendanceEvent` requires `recordedBy`. Valid correction requests cannot complete that write. The workflow also lacks a transaction across events/session/audit, looks up supplied session IDs without verifying worker/date/firm ownership, and checks the worker's current firm rather than the historical deployment/session firm. Repair together with integration tests for rollback, cross-firm/session mismatch, open-session conflicts and clearing an OUT.
2. **Historical reports — high.** Daily/monthly reports start with `Worker.find({ firm, active: true })` and open-ended deployments. Transferred/deactivated workers can disappear from old reports; future assignments can be used too early. Monthly shed labels/filtering use current deployment rather than the attendance snapshots. Build the report population from effective deployment history and historical sessions, accounting for joining/leaving dates.
3. **Report semantics — high.** Daily reporting combines not-reported and absent; monthly reporting uses an unconfirmed four-hour full/half-day rule and marks all past missing dates absent, including dates before joining. Daily summary counts are accumulated before the status filter, while `totalWorkers` uses filtered rows. Define and apply V1 statuses consistently.
4. **Transfers — high.** Future inter-firm transfers immediately change worker ownership while the deployment is future-effective. Verify source-firm scanning/access until the boundary, existing open attendance, backdating against recorded attendance, supervisor references and preserved old-firm history.
5. **Dashboard — high.** Recent activity queries `AttendanceEvent.date`, but the schema field is `attendanceDate`. Dashboard assignment population also uses current workers/open-ended deployments for historical dates. All-firms totals/view are missing.
6. **Operator permissions — high.** Add explicitly scoped attendance operator access; do not simply remove admin protection from the entire router, which also exposes private details, face templates and correction operations.
7. **Reports/history UI — medium.** Add designation and supervisor filters, worker attendance history, report pagination, full deployment-history pagination in worker details, and location notices. The audit search input currently sends `search`, but its service ignores it. Master option lists capped at 100 need complete pagination/search support.
8. **Export and requests — medium.** CSV escaping is incomplete for names/locations and spreadsheet formula input. Older report requests can overwrite newer filter results. Add cancellation or response-version guards and consistent export formatting. This UI pass resets dependent shed filters on firm change and disables export during loading/errors.
9. **Validation and verification — high before rollout.** Month validation accepts a shape without checking month range. Face recognition is browser-side; the backend trusts the submitted worker identity after checking registration, not a server recognition result. Evaluate this within the authorized operator design. Real recognition, retry behavior, model loading, camera cleanup, slow network and simultaneous phones still need acceptance testing.

## The 35 acceptance scenarios

| Scenario numbers from the original specification | Outcome of this audit |
| --- | --- |
| 1–6: admin, masters, worker and assignment | Implementation present; database acceptance not rerun. |
| 7–10: registration and real recognition | Implementation present; physical-camera acceptance pending. |
| 11–17: validation, IN, live counts and duplicate attempt | Implementation present; full concurrent/browser acceptance pending. |
| 18: immediate duplicate rejected | Cooldown/index unit coverage exists; real scan acceptance pending. |
| 19–25: departure, OUT, worked hours and live removal | Implementation present; real end-to-end acceptance pending. |
| 26–27: accurate daily/monthly reports | Gaps: historical worker population, monthly statuses and assignment filtering. |
| 28: worker attendance history | UI incomplete. |
| 29–31: transfer, preserved deployment, new assignment | Implementation present; boundary and database acceptance pending. |
| 32: old attendance still shows old shed | Snapshots exist, but reports can omit transferred workers or use current monthly labels. |
| 33–34: correction and original/corrected audit | Blocked by correction event field mismatch and integrity gaps. |
| 35: Diesel/Transport continue working | Their calculation regression tests pass; browser workflows not retested. |

## Responsive changes in this pass

- Attendance-scoped CSS avoids changing Diesel/Transport styling.
- Workers, masters, deployments, daily register, live staff and audit tables become labeled stacked rows below 768px; desktop retains tables with contained horizontal scrolling.
- Monthly summary has mobile worker cards with expandable day details; desktop retains the month matrix.
- Transfer, correction and face enrollment use the native shared dialog for keyboard focus containment, Escape handling and bounded scrolling. Correction time fields stack on narrow screens.
- Phone controls use 44px minimum targets and 16px form text; tab bars scroll within the page. Scanner header wraps and uses dynamic viewport height.
- Firm switches reset administrative panel state and dependent report shed filters.
- Displayed daily/live/audit times explicitly use Asia/Kolkata.

## Verification

- Backend default suite: **56 passed, 1 skipped**, 0 failed. The skipped test is the opt-in MongoDB integration suite.
- The file named `attendance.e2e.test.js` checks schemas/indexes/helpers; it is not a browser end-to-end acceptance suite.
- Frontend production build passed during implementation; final build and browser results are recorded after the responsive checks.
- Production data and real biometric records were not used for this review.

Next implementation priority: repair corrections and historical reporting with meaningful database integration tests, then finish the missing V1 workflows above before controlled farm trials.
