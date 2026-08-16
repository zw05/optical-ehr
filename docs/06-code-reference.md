# Code Reference

This document explains what each module, service method, API route, and frontend
page does. For inline comments while reading source files, look for `/** ... */`
JSDoc blocks above classes and functions.

**How the request flows:**

```
Browser (Next.js)  →  /api/* proxy  →  NestJS controllers  →  services  →  Prisma/PostgreSQL
                                                                    ↘  Blob storage (files/PDFs)
Global guards: JwtAuthGuard (who are you?) → RolesGuard (may you do this?)
Global interceptor: AuditInterceptor (log PHI access after each call)
```

---

## Backend entry point

| File | Purpose |
| ---- | ------- |
| `apps/api/src/main.ts` | Starts NestJS on port 3001, sets `/api` prefix, CORS, and global validation. |
| `apps/api/src/app.module.ts` | Wires all feature modules and registers global auth guards + audit interceptor. |
| `apps/api/src/prisma/prisma.service.ts` | Database connection lifecycle (`$connect` / `$disconnect`). |

---

## Authentication & authorization

### `AuthService` (`auth/auth.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `login(email, password, ip?)` | Verifies bcrypt password, issues a 15-minute JWT, writes a LOGIN audit event. Returns `{ accessToken, user }`. |

### Guards & decorators

| Symbol | What it does |
| ------ | ------------ |
| `JwtAuthGuard` | Requires `Authorization: Bearer <token>` on all routes except `@Public()`. Sets `request.user` to the JWT payload. |
| `RolesGuard` | Enforces `@Roles(...)` on routes. ADMIN bypasses role lists; clinical sign-off is still doctor-only inside services. |
| `@Public()` | Skips JWT check (login endpoint). |
| `@Roles(...)` | Declares which staff roles may call a route. |
| `@CurrentUser()` | Injects the JWT payload into a controller parameter. |

### API routes — auth

| Route | Handler | Description |
| ----- | ------- | ----------- |
| `POST /api/auth/login` | `AuthController.login` | Public. Returns JWT + user profile. |

---

## Audit

### `AuditService` (`audit/audit.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `log(entry)` | Appends one row to `AuditEvent`. Never throws — failures are logged to the server console. |
| `query(practiceId, filters)` | Admin audit viewer. Filter by patient or actor; max 500 rows. |

### `AuditInterceptor` (`audit/audit.interceptor.ts`)

| Method | What it does |
| ------ | ------------ |
| `intercept(...)` | After every authenticated API call, maps HTTP method → action (GET→READ, POST→CREATE, …) and writes an audit row. Skips noisy reads of templates/inventory. |

| Route | Description |
| ----- | ----------- |
| `GET /api/audit` | Admin only. Query audit log (`?patientId=`, `?actorId=`, `?take=`). |

---

## Patients

### `PatientsService` (`patients/patients.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `create(practiceId, dto)` | Registers a patient; assigns the next MRN (`P000001`, …). |
| `search(practiceId, query, take?)` | Finds active charts by name, MRN, phone, or email. Returns compact rows (no clinical detail). |
| `findOne(practiceId, id)` | Full chart header: demographics, histories, insurance, pending recalls. |
| `update(practiceId, id, dto)` | Updates demographics and contact fields. |
| `addHistory(practiceId, patientId, dto)` | Appends MEDICAL / OCULAR / ALLERGY / etc. history (never edited in place). |
| `resolveHistory(...)` | Marks a history entry resolved without deleting it. |
| `merge(practiceId, sourceId, targetId)` | Moves all clinical data to the target chart; deactivates the duplicate. Admin workflow. |
| `exportChart(practiceId, id)` | Full JSON export for HIPAA right-of-access requests. |

| Route | Roles | Description |
| ----- | ----- | ----------- |
| `POST /api/patients` | receptionist, tech, doctor | Register chart |
| `GET /api/patients?q=` | any | Search |
| `GET /api/patients/:id` | any | Chart detail |
| `PATCH /api/patients/:id` | receptionist, tech, doctor | Update demographics |
| `POST /api/patients/:id/history` | tech, doctor | Add history entry |
| `PATCH /api/patients/:id/history/:historyId/resolve` | tech, doctor | Resolve history |
| `POST /api/patients/:id/merge/:targetId` | admin | Merge duplicates |
| `GET /api/patients/:id/export` | doctor, admin | Full export |

---

## Insurance (records only — no claims in v1)

### `InsuranceService` (`insurance/insurance.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `create(practiceId, dto)` | Adds payer, member ID, group, dates, priority. |
| `listForPatient(practiceId, patientId)` | Policies ordered primary-first. |
| `update(practiceId, id, dto)` | Edits policy fields. |
| `setVerification(practiceId, id, status)` | Records manual verification result; stamps `verifiedAt` when VERIFIED. |

| Route | Description |
| ----- | ----------- |
| `POST /api/insurance` | Add policy |
| `GET /api/insurance/patient/:patientId` | List policies |
| `PATCH /api/insurance/:id` | Update policy |
| `PATCH /api/insurance/:id/verification` | Set UNVERIFIED / VERIFIED / INACTIVE |

---

## Scheduling

### `SchedulingService` (`scheduling/scheduling.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `createType(practiceId, dto)` | Defines a bookable visit type (name, duration, color). |
| `listTypes(practiceId)` | Active appointment types for the booking form. |
| `create(practiceId, dto)` | Books a slot; end time = start + type duration; rejects double-booking (409). |
| `calendar(practiceId, from, to, providerId?)` | Day/week view of appointments in a date range. |
| `update(practiceId, id, dto)` | Reschedule (only while SCHEDULED or CONFIRMED). |
| `setStatus(practiceId, id, dto)` | Lifecycle: confirm → check in → in progress → complete / cancel / no-show. **Check-in auto-creates an encounter** on the active exam template. |

| Route | Description |
| ----- | ----------- |
| `POST /api/appointments/types` | Create type (admin) |
| `GET /api/appointments/types` | List types |
| `POST /api/appointments` | Book appointment |
| `GET /api/appointments?from=&to=&providerId=` | Calendar query |
| `PATCH /api/appointments/:id` | Reschedule |
| `PATCH /api/appointments/:id/status` | Change status |

---

## Eye exams (encounters)

### `EncountersService` (`encounters/encounters.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `create(practiceId, dto)` | Opens a new exam on the active template (or a specified template). |
| `findOne(practiceId, id)` | Full exam for the documentation screen: template, patient, addenda, linked Rx. |
| `listForPatient(practiceId, patientId)` | Exam history on the chart. |
| `update(practiceId, id, dto)` | Saves draft data. **Merges** `clinicalData` section-by-section. Blocked once signed. |
| `sign(practiceId, id, user)` | Doctor only. Validates required template fields, freezes record, writes SIGN audit. |
| `addAddendum(practiceId, id, user, dto)` | Doctor only. Appends a correction note to a signed exam. |

### `TemplatesService` (`encounters/templates.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `list(practiceId)` | Active exam templates. |
| `create(practiceId, name, sections)` | New template version 1. |
| `publishNewVersion(practiceId, templateId, sections)` | Retires old version; creates version n+1 so signed exams keep their original layout. |

| Route | Description |
| ----- | ----------- |
| `POST /api/encounters` | Start exam |
| `GET /api/encounters/:id` | Exam detail |
| `GET /api/encounters/patient/:patientId` | Patient exam list |
| `PATCH /api/encounters/:id` | Save draft |
| `POST /api/encounters/:id/sign` | Sign & lock |
| `POST /api/encounters/:id/addenda` | Add addendum |
| `GET /api/templates` | List exam templates |
| `POST /api/templates` | Create template |
| `POST /api/templates/:id/versions` | Publish new version |

---

## Prescriptions

### `PrescriptionsService` (`prescriptions/prescriptions.service.ts`)

State machine: **DRAFT** (editable) → **FINALIZED** (locked, printable, orderable) → **SUPERSEDED** (replaced by version n+1).

| Method | What it does |
| ------ | ------------ |
| `create(...)` | Doctor creates DRAFT spectacle or CL Rx; values validated (sphere range, CL brand/BC/diameter, …). |
| `updateDraft(...)` | Replaces draft values only. |
| `finalize(...)` | Locks Rx, sets issue/expiration dates (default 24 mo spectacle / 12 mo CL), FINALIZE audit. |
| `supersede(...)` | Creates version n+1; marks old FINALIZED row SUPERSEDED in one transaction. |
| `findOne(...)` | Single Rx with prescriber credentials and version links. |
| `listForPatient(...)` | All Rx for a chart. |

| Route | Description |
| ----- | ----------- |
| `POST /api/prescriptions` | Create draft |
| `PATCH /api/prescriptions/:id` | Edit draft |
| `POST /api/prescriptions/:id/finalize` | Lock Rx |
| `POST /api/prescriptions/:id/supersede` | Issue corrected version |
| `GET /api/prescriptions/:id` | Rx detail |
| `GET /api/prescriptions/patient/:patientId` | Patient Rx list |

---

## Reports & documents

### `ReportsService` (`reports/reports.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `listTemplates` / `createTemplate` / `publishTemplateVersion` | Versioned PDF layouts (same pattern as exam templates). |
| `generatePrescriptionReport(...)` | Renders PDF from finalized Rx → stores in `reports` blob container with SHA-256 → PRINT audit. |
| `getReportContent(...)` | Re-downloads a stored PDF; READ audit. |

### `PdfRenderer` (`reports/pdf-renderer.ts`)

| Method | What it does |
| ------ | ------------ |
| `render(layout, content)` | Builds a US-Letter PDF: practice header, patient block, OD/OS sections, signature line. |

### `BlobStorageService` (`documents/blob-storage.service.ts`)

| Method | What it does |
| ------ | ------------ |
| `upload(container, fileName, data)` | Stores bytes (Azure Blob in prod, `./blob-dev` locally). Returns path + SHA-256. |
| `download(container, blobPath)` | Reads bytes back. |

### `DocumentsService` (`documents/documents.service.ts`)

Documents belong to the **chart**, not to a single visit. `EncounterDocument`
links one document to every exam it is relevant to, so a scanned outside Rx is
uploaded once and referenced across visits. Unlinking never deletes the file.

`Document.kind` classifies the import (`EXTERNAL_RX`, `KERATOMETRY`,
`INSURANCE_CARD`, …) and `extractedData` holds values transcribed off the page
(`{ od, os, kUnit, pd, notes }`). Those values start at `PENDING_REVIEW` and
must be attested by a technician or doctor before anything copies them into an
exam; editing them resets the attestation.

| Method | What it does |
| ------ | ------------ |
| `upload(...)` | Patient file attachment; optionally links it to an encounter in the same transaction. |
| `list(...)` | Metadata list for the chart. Transcribed clinical values are withheld from non-clinical roles. |
| `listForEncounter(...)` | Documents attached to one exam (Attached Docs tab). |
| `getContent(...)` | Download/view one file. |
| `update(...)` | Reclassify or correct transcribed values; bytes are never replaced. |
| `link(...)` / `unlink(...)` | Attach/detach a chart document to an exam. Blocked on signed and voided encounters. |
| `review(...)` | Clinical sign-off that transcribed values match the source image. |

| Route | Description |
| ----- | ----------- |
| `GET /api/reports/templates` | List report templates |
| `POST /api/reports/templates` | Create template |
| `POST /api/reports/templates/:id/versions` | Publish layout version |
| `POST /api/reports/prescriptions/:id` | Generate & return Rx PDF |
| `GET /api/reports/:id/content` | Re-download PDF |
| `POST /api/documents` | Upload attachment (base64 body, optional `encounterId`) |
| `GET /api/documents/patient/:patientId` | List attachments (optional `?kind=`) |
| `GET /api/documents/encounter/:encounterId` | List an exam's attached docs |
| `GET /api/documents/:id/content` | Download attachment |
| `PATCH /api/documents/:id` | Reclassify / correct transcribed values |
| `PATCH /api/documents/:id/review` | Mark reviewed or rejected |
| `POST /api/documents/:id/link` | Attach to an encounter |
| `DELETE /api/documents/:id/link/:encounterId` | Detach from an encounter |

---

## Optical orders

### `OrdersService` (`orders/orders.service.ts`)

Fulfillment path: `DRAFT → ORDERED → AT_LAB → RECEIVED → VERIFIED → DISPENSED` (or `REMAKE` / `CANCELLED`).

| Method | What it does |
| ------ | ------------ |
| `create(...)` | Opens DRAFT against a finalized, unexpired Rx; computes balance due. |
| `list(...)` | Work queue with optional status/patient filter. |
| `findOne(...)` | Order detail + full status timeline. |
| `update(...)` | Edit frame/lens details, lab, pricing (not after dispensed/cancelled). |
| `setStatus(...)` | Advances status; validates TRANSITIONS table; stamps milestone dates. |
| `remake(...)` | Closes original as REMAKE; opens linked replacement order. |

| Route | Description |
| ----- | ----------- |
| `POST /api/orders` | Create order |
| `GET /api/orders?status=&patientId=` | List orders |
| `GET /api/orders/:id` | Order detail |
| `PATCH /api/orders/:id` | Edit order |
| `PATCH /api/orders/:id/status` | Advance status |
| `POST /api/orders/:id/remake` | Start remake |

---

## Recalls, inventory, tasks

### `RecallsService`

| Method | What it does |
| ------ | ------------ |
| `create(...)` | Schedules a recall (annual exam, CL follow-up, …). |
| `due(practiceId, horizon)` | Work queue of PENDING/CONTACTED recalls due before the horizon date. |
| `setStatus(...)` | PENDING → CONTACTED → SCHEDULED or DISMISSED. |

### `InventoryService`

| Method | What it does |
| ------ | ------------ |
| `list(...)` | Search frames / CL trial stock by SKU, brand, model. |
| `upsert(...)` | Create or update an item by SKU. |
| `adjustQuantity(...)` | +1 receive / −1 dispense; rejects negative stock. |
| `deactivate(...)` | Soft-delete an SKU. |

### `TasksService`

| Method | What it does |
| ------ | ------------ |
| `create(...)` | Internal to-do (callback, order follow-up, …). |
| `list(...)` | Filter by status and/or assignee. |
| `setStatus(...)` | OPEN → IN_PROGRESS → DONE. |

---

## Frontend (`apps/web`)

### `lib/api.ts`

| Function | What it does |
| -------- | ------------ |
| `getToken()` / `getSessionUser()` | Read JWT and user from `sessionStorage`. |
| `setSession(token, user)` | Store after login. |
| `clearSession()` | Sign out. |
| `api(path, options?)` | Authenticated fetch to `/api/*`. Handles 401 redirect, JSON errors, PDF blobs. |

### `components/AppShell.tsx`

| Function | What it does |
| -------- | ------------ |
| `AppShell` | Layout wrapper: sidebar nav (role-filtered), user info, sign out, **15-minute idle logout**. |

### Pages

| Page | File | What it does |
| ---- | ---- | ------------ |
| Login | `app/login/page.tsx` | Staff sign-in form → stores session → redirects to dashboard. |
| Dashboard | `app/dashboard/page.tsx` | Today's appointments, orders ready for pickup, recalls due. |
| Patients | `app/patients/page.tsx` | Search + register new patient. |
| Patient chart | `app/patients/[id]/page.tsx` | Demographics, insurance, exams (clinical roles), Rx list, print finalized Rx PDF. |
| Schedule | `app/schedule/page.tsx` | Day calendar; confirm, check in, complete, cancel appointments. |
| Exam | `app/exams/[id]/page.tsx` | Template-driven exam form; save draft; doctor sign & addenda. |
| Orders | `app/orders/page.tsx` | Optical order queue; advance status; remake. |
| Recalls | `app/recalls/page.tsx` | Recall outreach work list. |
| Inventory | `app/inventory/page.tsx` | Frame/CL trial stock; adjust quantities. |
| Audit | `app/audit/page.tsx` | Admin PHI access log viewer. |

---

## Database schema (quick map)

See `apps/api/prisma/schema.prisma` for full definitions.

| Model | Stores |
| ----- | ------ |
| `Practice` | Single-store settings (name, address, logo). |
| `User` | Staff accounts, roles, doctor license/NPI. |
| `Patient` | Demographics, MRN, merge pointer. |
| `PatientHistory` | Medical/ocular/allergy/medication/diagnosis rows. |
| `InsurancePolicy` | Payer/member details + verification status. |
| `Appointment` / `AppointmentType` | Scheduling. |
| `ExamTemplate` / `Encounter` / `Addendum` | Configurable exams + signed records. |
| `Prescription` | Versioned spectacle/CL Rx. |
| `ReportTemplate` / `GeneratedReport` | PDF layouts + issued copies with hash. |
| `Document` | Attachment metadata (bytes in blob storage). |
| `OpticalOrder` / `OrderStatusEvent` | Dispensary fulfillment + timeline. |
| `InventoryItem` | Frame/CL trial stock. |
| `Recall` / `Task` | Outreach and internal work queues. |
| `AuditEvent` | Append-only PHI access log. |

---

## Seed data (`apps/api/prisma/seed.ts`)

Creates one practice, five dev users (one per role), default exam + report templates, appointment types, and a demo patient `P000001`. Password for all dev users: `ChangeMe!Dev1`.
