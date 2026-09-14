# Attendance V1 development

The original client specification is preserved in `attendance-v1-requirements.txt`.

Follow the client's staged development order. Stages 1 and 2 provide backend masters
and deployment; they do not enable attendance scans or replace the Coming Soon screen.

## Stage sequence

1. Core masters: designations, work locations, workers (implemented).
2. Initial/current deployment and paginated deployment history (implemented).
3. Administration UI, worker photos, supervisors, and deployment forms (implemented).
4. One attendance service: test IN/OUT, server time, duplicates, concurrency and durations using worker IDs.
5. Face enrolment and recognition.
6. Connect recognition to the same attendance service.
7. Live firm/shed dashboard and worker lists.
8. Daily/monthly reports, filters, export and history.
9. Shed/inter-firm transfers with transactions and preserved history.
10. Corrections with reasons and immutable audit records.
11. Controlled production testing, including mobile cameras and concurrent scans.

## Stage 1 decisions

- Existing `Firm`, `User`, JWT middleware and MongoDB connection are reused.
- Attendance owns its models, validation, authorization, routes and services under
  `backend/src/attendance`. Only its router mount is added to the existing app.
- Masters require admin/developer access. Labour accounts have no access to these
  administrative APIs. Operator permissions will be added with the attendance stage.
- Developers can access all firms. Admins can access only their assigned `User.firms`;
  the existing initial admin setup assigns both firms. Empty firm assignments grant
  no attendance firm access. Existing Diesel/Transport permissions are untouched.
- Designations and locations are firm-scoped. The same designation name can exist in
  both firms. Normalized names are unique within each firm, including inactive records.
- Worker IDs use atomic counters and a unique index: `RGF-0001`, `SJF-0001`.
  Counters are never reset; a failed write may leave a gap. Deactivation does not free IDs.
- `Worker.firm` is current administrative ownership. It cannot be patched through
  worker editing. Effective-dated deployment is the source of assignment history;
  Stage 9 must update ownership only inside the transfer transaction.
- Worker creation now requires initial firm, designation and `initialDeployment`.
  There is no shed field on Worker. Worker and initial deployment save atomically.
  Once history exists, worker PATCH cannot change designation or joining date;
  those changes require the later transfer/correction workflows.
- A supervisor is an existing worker with `isSupervisor: true`. Location assignment
  validates active status and firm ownership. Reassign active locations before
  deactivating a supervisor or removing their supervisor flag.
- Dates on worker masters use validated `YYYY-MM-DD` strings (calendar dates).
  Future attendance timestamps must use server-generated UTC instants.
- Photograph storage is an HTTPS file reference only. File upload/storage is not yet
  implemented; no base64 images or face descriptors are stored on Worker.
- Aadhaar/bank details are optional and excluded from ordinary reads and write responses.
  A separate admin-only, firm-scoped endpoint retrieves them with `Cache-Control: no-store`.
  Aadhaar syntax validation is not identity verification. Bank details are stored as strings
  to preserve leading zeroes; there is no bank integration.
- Face status starts at `NOT_REGISTERED` and cannot be set by worker-edit requests.
- No hard-delete endpoints exist. PATCH `active` to retain records and references.
- Updates use optimistic concurrency so conflicting document edits return 409.
- No seed scripts, deployment commands or production data migrations were run by this stage.

## API

All endpoints are under `/api/attendance` and require an admin/developer bearer token.

| Resource | Methods | Purpose |
| --- | --- | --- |
| `/firms` | GET | Authorized active firms |
| `/capacity` | GET | Active shed capacity totals per authorized active firm; optional `firmId` |
| `/designations` | GET, POST | Paginated list / create |
| `/designations/:id` | GET, PATCH | Read / edit / activate / deactivate |
| `/work-locations` | GET, POST | Paginated list / create |
| `/work-locations/:id` | GET, PATCH | Read / edit / activate / deactivate |
| `/workers` | GET, POST | Paginated list / create worker and initial deployment atomically |
| `/workers/:id` | GET, PATCH | Read / edit / activate / deactivate |
| `/workers/:id/private-details` | GET | Authorized Aadhaar/bank details |
| `/workers/:id/initial-deployment` | POST | One-time assignment for a Stage 1 worker with no history |
| `/workers/:id/deployment` | GET | Effective deployment now, or at `?at=<date/time>` |
| `/workers/:id/deployments` | GET | Paginated, authorized deployment history |
| `/deployments` | GET | Paginated history across authorized firms, optionally effective at `at` |

Lists return `{ items, pagination: { page, limit, total, pages } }`.
Filters: `firmId`, `active=true|false`, `search`, `page`, `limit=25|50|100`.
Workers additionally accept `designation` and `isSupervisor=true|false`.
Locations additionally accept `type=SHED|MISCELLANEOUS`.
Worker search matches full name, worker ID or mobile number as literal text.

Create a designation:

```json
{ "firmId": "<existing firm ObjectId>", "name": "Farm Worker" }
```

Create a location:

```json
{ "firmId": "<existing firm ObjectId>", "name": "Shed 1", "type": "SHED", "order": 1 }
```

Create a worker with an initial deployment:

```json
{
  "firmId": "<existing firm ObjectId>",
  "fullName": "Raj Kumar",
  "dateOfJoining": "2026-09-01",
  "designation": "<designation ObjectId>",
  "initialDeployment": {
    "workLocation": "<work location ObjectId>",
    "supervisor": null,
    "effectiveFrom": "2026-09-01",
    "reason": "Initial deployment"
  }
}
```

PATCH accepts only writable fields. Supplying firm IDs, worker codes, creator IDs or
face status on worker edits returns 400. Use `null` to clear supervisor/leaving date,
Aadhaar/bank details; use an empty string to clear optional text or photograph URL.
Bank details updates replace the whole bank subdocument and require account number and IFSC.
Clear leaving date when reactivating a worker.

## Stage 2 deployment contract

- `POST /workers` returns `{ worker, deployment }`. `worker` still excludes Aadhaar/bank
  details. `initialDeployment.workLocation` is required. `effectiveFrom` defaults to
  the joining date; it cannot precede joining. `reason` defaults to `Initial deployment`.
  Omitted supervisor inherits the location's supervisor; explicit `null` means none.
- Date-only values use midnight in **Asia/Kolkata** (`+05:30`), stored as UTC instants.
  ISO timestamps require an explicit `Z` or offset. Invalid calendar dates and ambiguous
  timezone-free timestamps are rejected. Future assignments are supported and do not
  appear as current until their start instant.
- Initial assignment validates active worker/firm/location/designation, same-firm
  references, supervisor eligibility, no self-supervision and supervisor joining date.
  Both SHED and MISCELLANEOUS locations support worker deployment.
- Worker creation and initial assignment use one MongoDB transaction. The worker ID
  counter is reserved outside that transaction; failures may leave gaps but never reuse IDs.
  A replica set or sharded MongoDB deployment is required. There is no non-transactional fallback.
- Stage 1 workers can be assigned once using `POST /workers/:id/initial-deployment`
  with the same nested object's fields directly as the request body. It uses the worker's
  existing firm and designation. Any existing history, even closed history, returns 409.
  A transactional worker version update serializes simultaneous requests and conflicts
  with concurrent profile edits; failed assignments roll back the version change too.
- Unique partial indexes allow only one INITIAL record and one open-ended record per
  worker. Only INITIAL can be created through the Stage 2 API. There are no deployment
  update/delete/transfer endpoints yet. Later stages must close and append records in
  one transaction, avoid overlapping intervals, and retain existing history.
- `findEffectiveDeployment(workerId, at, { session, scope })` is the shared lookup for
  future attendance logic. Intervals include their start and exclude their end:
  `effectiveFrom <= at < effectiveTo`, with null end treated as unbounded.
  At a transfer boundary exactly the new deployment applies. Overlapping matching
  intervals return 409 instead of arbitrarily choosing an assignment.
- A deployment's `active` response field means its interval is open-ended, not that
  it is effective now or the worker is currently active. Historical lookup includes
  closed intervals. Deactivating a worker retains their history and assignment; Stage 4
  must separately validate worker/master activity before recording attendance.
- Worker code/name, firm name, location name, designation name and supervisor name
  are captured at assignment time. History reads snapshots without exposing sensitive
  worker details or rewriting names after a master is renamed.
- History is authorized by the deployment's firm. After a future inter-firm transfer,
  an old firm's admin may read only the worker's history in that firm; they cannot see
  the destination assignment. A scoped current lookup returns null if no authorized
  assignment exists at that time. Unknown or entirely unauthorized worker IDs return 404.
- Current lookup returns `{ at, deployment }`, with `deployment: null` before initial
  assignment or in a gap. It defaults to server time. Lists return the standard
  `{ items, pagination }` shape sorted newest-first with a stable ID tie-breaker.
  List filters: `firmId`, `workerId`, `workLocation`, `designation`, `supervisor`, `at`,
  `page`, `limit`. Per-worker history uses the URL worker ID.
- Supervisors cannot be deactivated or lose their supervisor flag while assigned to
  current/future worker deployments, in addition to the existing location check.
- Worker creation now requires the initial deployment payload. Update API clients and
  fixtures accordingly; no production migration or automatic legacy assignment is run.

Stage 3 can now build the administration forms on these endpoints. Transfer forms
and corrections remain later stages, as specified by the client.

Stage 2 verification: 23 unit/regression tests passed, including the existing Diesel
and Transport calculation tests. The opt-in MongoDB/HTTP suite passed 14 scenarios
(15 tests including its parent). It verified transaction rollback, reserved worker IDs,
30 concurrent worker creations with deployments, simultaneous initial assignments,
legacy workers, supervisor checks, firm isolation, historical snapshots, exact interval
boundaries, overlap rejection, future assignments, and paginated history. The uniquely
named temporary database was removed successfully. No production data migration was run.

## Stage 3 implementation

- Dedicated administration area under `/admin/attendance` with firm switching and firm
  shed bird capacity totals (male, female, total, configuration completeness indicator).
- `WorkersPanel`: searchable worker list with filters for firm, designation, supervisor status,
  and active/inactive. Responsive layout with worker photo previews and status badges.
- Worker creation modal: atomically registers worker master + initial deployment. Supports
  direct photo file upload (JPEG, PNG, WebP up to 2 MB) with magic-byte verification,
  and optional confidential Aadhaar (12 digits) and Bank details.
- Worker edit modal: updates personal fields, supervisor eligibility, and active status
  with leaving date and reason. Protects immutable firm ownership, code, and joining date.
- Worker details drawer: shows profile, photo, current effective assignment, full deployment
  history table, and confidential bank/Aadhaar details for authorized admins.
- `MastersPanel`: work locations (sheds and miscellaneous) with bird capacity editor
  (male, female, calculated total), display order, and supervisor assignment; designations.
- `DeploymentPanel`: view current assignments, assignments effective at any date/time
  (India standard time `Asia/Kolkata`), and full deployment history with snapshot names.
- One-time initial deployment form for any workers created without deployment history.
- Navigation link added under Administration in sidebar; route protected by admin auth.
- Backend photo service verifies magic bytes, limits file size to 2 MB, and stores photos
  in isolated directories with firm-scoped bearer token access (`GET /workers/:id/photo`).

## Verification

From `backend` on Windows:

```powershell
npm.cmd test
```

The default test suite performs no database operations. The integration suite is opt-in:

```powershell
$env:ATTENDANCE_INTEGRATION_TEST = '1'
node --test --test-force-exit test/attendance.integration.test.js
Remove-Item Env:ATTENDANCE_INTEGRATION_TEST
```

It reads the local backend `.env` connection (or `ATTENDANCE_TEST_MONGODB_URI`) and
**overrides the database name** with `att1_<random UUID>` (under 38 bytes).
It never selects the URI's application database or uses `MONGODB_DB_NAME`.
Only its own temporary test database is dropped after verification. The connection
must allow creating and removing that test database. If interrupted, remove only the
specific temporary database from that test run, never an application database.

Coverage includes real JWT/role checks, firm isolation on list/read/edit/private details,
cross-firm references, name uniqueness, worker validation, supervisor eligibility,
activation/deactivation, sensitive field projection and clearing, literal searches,
pagination, 30 concurrent worker creations, immutable ownership/IDs and no hard deletion.
Existing Diesel/Transport calculation tests also run in the normal suite.

Stage 1 verification before the capacity extension: 18 default tests passed (7 attendance validation/authorization
tests and 11 existing report calculation tests). The opt-in MongoDB/HTTP integration
suite passed all 7 scenarios (8 tests including the parent), including 30 concurrent
worker creations. Its temporary database was removed successfully. An initial test
run exposed this cluster's 38-byte database-name limit; the disposable name now fits.
No frontend build was required because this stage changes backend code only.

## Client addition: bird capacity

Shed master supports `birdCapacity: { male: 500, female: 5000 }`.
Both values are required when configuring capacity, and must be whole numbers from
0 to 1,000,000,000. Zero is a deliberate configured value. Send `null` to clear capacity.
Updates replace both counts together. Capacity is not the actual bird stock or occupancy.

Location create/read/update/list responses include calculated `birdCapacity.total`;
clients must not submit a total. Missing capacity, including on older locations, returns
`null` rather than implying zero. Miscellaneous work locations cannot have bird capacity;
clear capacity explicitly before changing a shed to a miscellaneous location.

`GET /api/attendance/capacity?firmId=<optional ID>` derives each firm's male, female and
total capacity from its active sheds. Inactive sheds and miscellaneous locations do not
contribute. The result includes `shedCount`, `configuredSheds`, `unconfiguredSheds` and
`capacityComplete`. Where configuration is incomplete, `birdCapacity` is the known subtotal,
not a confirmed full-firm capacity. A firm with no sheds returns zero counts and
`capacityComplete: false`. Firm capacity is not separately editable, preventing conflicting totals.

The Stage 3 shed form should expose male/female inputs and a calculated total; its firm
summary should show missing-configuration indicators. This backend extension requires no
data migration and does not add UI ahead of the agreed development stages.

## Client addition: location captured with face attendance

The client has added scan-time geolocation to V1. This supersedes the original
specification's exclusion of GPS attendance only for this limited capture requirement.
Continuous location tracking, geofencing and device restrictions remain outside scope.

- Capture the phone/browser's location when marking each DUTY_IN or DUTY_OUT through
  the face attendance workflow, after browser permission. Location comes from the device,
  not from the face image or face recognition model.
- Stage 4 must support optional event location metadata in the shared attendance service;
  Stages 5–6 must acquire it in the scanner and submit it with the scan. Do not introduce
  a second attendance service for scans with location.
- Store latitude, longitude, accuracy in metres, the device position timestamp and a
  location status with the immutable attendance event. Keep the server's attendance
  timestamp separate; device time must never determine the IN/OUT time.
- Validate coordinate ranges, finite nonnegative accuracy and position timestamps on
  the backend. Request a fresh reading with a bounded timeout and distinguish captured,
  permission denied, unavailable and timeout. Never fabricate a location or silently
  reuse a previous worker's coordinates.
- Device-reported coordinates are not verified proof that a worker is at the farm.
  Do not label them as geofence verification or guaranteed GPS accuracy.
- Show permission and capture status clearly in the scanner. Production camera/location
  use requires a secure browser context; local development can use localhost. Stop
  any location watchers when the scanner is closed, just as with its camera stream.
- Location is accessible only through authorized, firm-scoped attendance detail/report
  APIs; do not expose it in public worker/master endpoints.
- Final client decision: location is OPTIONAL. Ask for permission during the scan,
  but still accept otherwise valid attendance when permission is denied or location
  is unavailable. This replaces the earlier instruction to block attendance.
- Save location status on the successful attendance event itself, alongside worker,
  operator and server timestamp. Do not create a failed attendance event solely because
  location is missing. All ordinary identity, authorization and IN/OUT validations remain.
- Admin report message for PERMISSION_DENIED: "Attendance marked without location —
  permission not granted." UNAVAILABLE and TIMEOUT have distinct messages. Do not claim
  deliberate refusal when a GPS error occurred. Show a visible warning on the event row.
- Invalid, stale or absent location data is discarded and marked INVALID/NOT_PROVIDED;
  it must not block attendance. Statuses are client-reported, not proof of intent or presence.
- Implemented reusable pieces: frontend `captureLocation` (fresh reading, bounded wait,
  non-rejecting errors), backend `normalizeAttendanceLocation`, embeddable
  `attendanceLocationSchema`, backend `attendanceLocationReport` and frontend
  `AttendanceLocationNotice`. The browser helper never reuses previous coordinates.
- Integration required in later stages: Stage 4 embeds normalized location on each
  immutable IN/OUT event. Stages 5–6 call the browser helper and submit its result with
  the scan. Stage 8 returns server-generated report messages to the notice component.
  Only show "Attendance marked" after the attendance request succeeds. Never derive
  attendance timestamps from location capture time. No scanner/report routes exist yet.

The optional-location building blocks are implemented and tested. They are not yet
wired into a live attendance flow: Stage 2 does not record attendance events or recognize
faces. Browser permission/camera testing awaits the scanner stage.
