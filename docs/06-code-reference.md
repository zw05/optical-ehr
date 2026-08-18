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
| `login(email, password, ip?)` | Verifies bcrypt password, issues a JWT (`JWT_EXPIRES_IN`, 15 minutes by default), writes a LOGIN audit event. Returns `{ accessToken, user, preferences, permissions }`. |

### Guards & decorators

| Symbol | What it does |
| ------ | ------------ |
| `JwtAuthGuard` | Requires `Authorization: Bearer <token>` on all routes except `@Public()`. Sets `request.user` from the token, then refreshes the role and resolves the effective permission set from the account row, rejecting deactivated accounts. |
| `RolesGuard` | Enforces `@Roles(...)` on routes. ADMIN bypasses role lists; clinical sign-off is still doctor-only inside services. |
| `PermissionsGuard` | Enforces `@RequirePermission(...)` against the set JwtAuthGuard resolved, so a revoked capability applies on the next call rather than the next login. |
| `@Public()` | Skips JWT check (login endpoint). |
| `@Roles(...)` | Declares which staff roles may call a route. |
| `@RequirePermission(...)` | Declares which capabilities a route needs. See [Store settings](#store-settings). |
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
| `intercept(...)` | After every authenticated API call, maps HTTP method → action (GET→READ, POST→CREATE, …) and writes an audit row. Skips noisy *reads* of non-PHI reference data (templates, inventory, store settings, codes, payers); every write is recorded. |

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
| `list(...)` | Search frames / CL trial stock by SKU, brand, model. `lowStockOnly` narrows to items at or below their reorder point, filtered in the service because Prisma cannot compare two columns. |
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

## Store settings

Practice-level catalogs and pricing, reachable from **Settings -> Store**. Reading these is
open to any signed-in role because quoting a job at the dispensing table needs them; each
write is gated by a capability an administrator can reassign per person.

### Capabilities (`auth/permissions.ts`)

Layered on top of the `Role` enum: roles decide what a job normally does, capabilities let an
administrator make an exception for one person without inventing a new role.

| Export | What it does |
| ------ | ------------ |
| `Permission` | The capability keys: profile, lens pricing, contact lens pricing, frames, codes, payers, accounts. |
| `PERMISSION_CATALOG` | Key + label + description, rendered by the account permissions screen. |
| `ROLE_DEFAULT_PERMISSIONS` | Every role holds the store catalogs; only ADMIN holds `store.accounts.manage`. |
| `parseOverrides(raw)` | Reads `User.permissionOverrides`, discarding unknown keys. |
| `effectivePermissions(role, raw)` | Role defaults + explicit grants - explicit denials. An administrator never loses account management. |

`JwtAuthGuard` resolves the effective set from the account row on every request - it is never
signed into the token - so a revoked capability takes effect on the next call rather than the
next login. `PermissionsGuard` enforces `@RequirePermission(...)` against it.

### `PricingService` (`pricing/pricing.service.ts`)

Spectacle lenses are priced by **power band** rather than by individual cell: a band covers a
range of sphere and cylinder at one price, and where bands overlap the narrowest wins, so a
high-power surcharge can sit on top of a base band without editing it.

| Method | What it does |
| ------ | ------------ |
| `listPriceLists(...)` / `getPriceList(...)` | Price lists (one per design + material) with their bands. |
| `createPriceList(...)` / `updatePriceList(...)` | Add a list; rename, re-index, or deactivate one. |
| `putRanges(...)` | Replaces a list's bands wholesale; snaps powers to quarter dioptres and rejects plus-cyl. |
| `listAddOns(...)` / `createAddOn(...)` / `updateAddOn(...)` | Coatings and add-ons. |
| `quote(...)` | Prices one power plus add-ons. An uncovered power returns `null`, never zero. |
| `templateBuffer()` / `exportBuffer(...)` | Starter workbook; export in the shape import accepts. |
| `importWorkbook(practiceId, data, preview)` | With `preview` set, parses and diffs without writing a thing. |

### `price-ranges.ts`

| Export | What it does |
| ------ | ------------ |
| `collapseGridToRanges(cells)` | Collapses a full SPH x CYL lab grid into the fewest bands that reproduce it exactly. |
| `findRange(ranges, sph, cyl)` | Narrowest matching band; `sortOrder` breaks ties. |
| `describeRange(range)` | Human-readable band, e.g. `+4.00 to -6.00 sph / 0.00 to -2.00 cyl`. |

Imports also warn when a grid skips quarter-dioptre steps, because those powers import
unpriced and the gap is otherwise only discovered with a patient at the counter.

### `ContactLensPricingService` (`contact-lens-pricing/`)

Priced per box rather than per power, since contact lens parameters do not change the price.
Annual and six-month bundles are stored rather than derived, because they are discounted off
the per-box rate; where a bundle price is unset the quote falls back to boxes and says so.

| Method | What it does |
| ------ | ------------ |
| `listProducts(...)` / `createProduct(...)` / `updateProduct(...)` | Brand, modality, lens type, box and bundle pricing. |
| `listFees(...)` / `createFee(...)` / `updateFee(...)` | Fitting and evaluation fees, kept separate because plan allowances treat them differently. |
| `quote(...)` | Supply for one or both eyes plus fees; reports whether it priced from a bundle or by the box. |
| `templateBuffer()` / `exportBuffer(...)` / `importWorkbook(...)` | Same preview-then-commit import as lens pricing. |

### `CodesService` (`codes/codes.service.ts`)

The diagnosis and procedure catalog, seeded from bundled optometry starter sets on first use
and editable thereafter.

| Method | What it does |
| ------ | ------------ |
| `ensureSeeded(practiceId)` | Fills an empty catalog from `ICD10_OPTOMETRY`, `CPT_OPTOMETRY`, `HCPCS_OPTOMETRY`. Never re-seeds a curated list. |
| `search(...)` | Type-ahead ranked exact -> prefix -> word -> substring, favourites first. |
| `list(...)` | One page of the catalog: `{ rows, total, page, pageSize, totalPages }`. Paged in the database, and clamps a page number the filter no longer reaches. |
| `create(...)` / `update(...)` | Catalog maintenance. |
| `retire(...)` | Withdraws a code from the pickers. Signed exams reference codes by value, so entries are never destroyed. |
| `restoreDefaults(...)` | Re-adds the bundled codes without disturbing existing ones. |
| `templateBuffer()` / `exportBuffer(...)` / `importWorkbook(...)` | Workbook round-trip; the export omits retired codes so importing it cannot silently un-retire them. |

### API routes - store settings

| Route | Capability |
| ----- | ---------- |
| `GET /api/pricing/lens-lists`, `/:id`, `/add-ons`, `/quote` | Any signed-in role |
| `POST`/`PATCH`/`PUT` `/api/pricing/*`, `POST /api/pricing/lens-lists/import` | `store.lensPricing.edit` |
| `GET /api/contact-lens-pricing/products`, `/fees`, `/quote` | Any signed-in role |
| `POST`/`PATCH` `/api/contact-lens-pricing/*`, `/import` | `store.contactLensPricing.edit` |
| `GET /api/codes`, `/icd10`, `/search` | Any signed-in role |
| `POST`/`PATCH`/`DELETE` `/api/codes*` | `store.codes.edit` |
| `POST`/`DELETE` `/api/inventory`, `/frames/import`, `/frames/template` | `store.frames.edit` |
| `POST`/`PATCH` `/api/accepted-payers` | `store.payers.edit` |
| `PATCH /api/practice`, `POST /api/practice/logo` | `store.profile.edit` |
| `GET /api/users?all=1`, `POST /api/users`, `PATCH /api/users/:id/active`, `/permissions` | `store.accounts.manage` |

Every write above lands in the audit trail; `AuditInterceptor` skips only *reads* of non-PHI
reference data, and account and permission changes additionally log a readable before/after.

---

## Frontend (`apps/web`)

### `lib/api.ts`

| Function | What it does |
| -------- | ------------ |
| `getToken()` / `getSessionUser()` | Read JWT and user from `sessionStorage`. |
| `setSession(token, user, preferences?, permissions?)` | Store session, preference cache, and capability set after login. |
| `clearSession()` | Sign out. |
| `api(path, options?)` | Authenticated fetch to `/api/*`. Handles 401 redirect, JSON errors, and binary responses (PDF, images, xlsx) as blobs. |
| `downloadApiFile(path, filename)` | Fetches a blob and saves it — used by every template and export button. |
| `fileToBase64(file)` | Encodes a picked file for the JSON upload endpoints. |
| `apiUpload(path, file, field?)` | Multipart upload variant. |

### `lib/permissions.ts`

Mirrors the API's capability keys. Used only to decide what to show - every gated route is
enforced server-side, so hiding a section here is a courtesy, not the security boundary.

### `components/ImportPanel.tsx`

Template download, export, and a **preview-before-commit** Excel import shared by lens
pricing, contact lenses, frames, and codes. The server parses the workbook and reports what
would change; only a second, explicit click writes it.

### `components/MoneyInput.tsx`

A price field with a faded `$` drawn inside the box via CSS. It is decoration
rather than a real `placeholder`, so it stays put while the field is being typed
into, and it never touches the value — what gets submitted is a bare number.
Used for every currency field in settings; count fields such as "boxes per year"
deliberately keep a plain input.

### `components/AppShell.tsx`

| Function | What it does |
| -------- | ------------ |
| `AppShell` | Layout wrapper: sidebar nav (role-filtered), user info, sign out, **idle logout** (15 minutes by default, 5–30 per user preference). |

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
| Preferences | `app/settings/page.tsx` | Per-user theme, font scale, exam layout. |
| Store profile | `app/settings/store/page.tsx` | Name, contact details, hours, logo, NPI, tax ID. |
| Lens pricing | `app/settings/pricing/page.tsx` | Price lists, power-band editor, coatings, Excel import, in-page price check. |
| Contact lenses | `app/settings/contact-lenses/page.tsx` | Lens catalog with box and supply pricing; fitting fees. |
| Frames | `app/settings/frames/page.tsx` | Frame SKUs, measurements, cost/retail, low-stock view, catalog import. |
| Codes | `app/settings/codes/page.tsx` | ICD-10 / CPT / HCPCS catalog; paged with debounced search, pin, retire, import. |
| Accepted insurances | `app/settings/insurance/page.tsx` | Payer catalog with allowances, copays, auth flags. |
| Accounts | `app/settings/accounts/page.tsx` | Staff accounts, roles, per-user permissions, activation. Needs `store.accounts.manage`. |

---

## Database schema (quick map)

See `apps/api/prisma/schema.prisma` for full definitions.

| Model | Stores |
| ----- | ------ |
| `Practice` | Single-store settings (name, address, hours, logo, NPI, tax ID). |
| `User` | Staff accounts, roles, doctor license/NPI, per-user permission overrides. |
| `Patient` | Demographics, MRN, merge pointer. |
| `PatientHistory` | Medical/ocular/allergy/medication/diagnosis rows. |
| `InsurancePolicy` | Payer/member details + verification status. |
| `Appointment` / `AppointmentType` | Scheduling. |
| `ExamTemplate` / `Encounter` / `Addendum` | Configurable exams + signed records. |
| `Prescription` | Versioned spectacle/CL Rx. |
| `ReportTemplate` / `GeneratedReport` | PDF layouts + issued copies with hash. |
| `Document` | Attachment metadata (bytes in blob storage). |
| `OpticalOrder` / `OrderStatusEvent` | Dispensary fulfillment + timeline. |
| `InventoryItem` | Frame/CL trial stock with measurements, cost/retail, reorder point. |
| `LensPriceList` / `LensPriceRange` | Spectacle lens price lists and their power bands. |
| `OpticalAddOn` | Coatings and lens add-ons. |
| `ContactLensProduct` / `ContactLensFee` | Contact lens catalog with box and supply pricing; fitting fees. |
| `CodeCatalogEntry` | Practice-maintained ICD-10 / CPT / HCPCS codes. |
| `Recall` / `Task` | Outreach and internal work queues. |
| `AuditEvent` | Append-only PHI access log. |

---

## Seed data (`apps/api/prisma/seed.ts`)

Creates one practice, five dev users (one per role), default exam + report templates, appointment types, and a demo patient `P000001`. Password for all dev users: `ChangeMe!Dev1`.
