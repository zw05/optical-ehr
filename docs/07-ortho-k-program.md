# Ortho-K Program — Implementation Plan

A dedicated **Ortho-K** tab that tracks every patient in the orthokeratology program
on its own board, while those same patients stay in the normal Patients directory
(carrying an Ortho-K tag) so their glasses and soft-contact-lens business is
unaffected.

Exams themselves stay on paper. The system does **not** capture Ortho-K exam
findings; it records **when each follow-up happened**, tells the front desk **what
is due next**, and raises **notifications for overdue follow-ups and recalls**.

---

## 1. What already exists

| Piece | Status |
| ----- | ------ |
| `PatientTag.ORTHO_K` enum + `Patient.tags` column | Shipped (migration `20260728170000_patient_tags`) |
| Tag chips on the patient row and chart, tag toggle on the chart | Shipped (`apps/web/src/app/patients/[id]/page.tsx`) |
| Tag filter in the patient directory (`?tag=ORTHO_K`) | Shipped (`patients.service.ts` → `{ tags: { has } }`) |
| `Recall` model + `/recalls` work queue + dashboard "Recalls due" panel | Shipped |
| `ContactLensType.ORTHO_K`, `ContactLensFeeKind.FITTING_ORTHO_K` pricing | Shipped |

So the *tagging half* of the request is largely done. The remaining work on that
side is cosmetic and glue (§5). The new build is the Ortho-K board itself.

---

## 2. Data model (Prisma)

Two new models plus two enums. Both hang off `Practice` and `Patient` so they
follow the existing tenancy and audit conventions.

```prisma
enum OrthoKMilestone {
  DAY_1
  DAY_2
  WEEK_1
  MONTH_1
  MONTH_3
  MONTH_6
  SEMIANNUAL  // recurring six-month check once the numbered sequence is complete
  INTERIM     // anything in between: unscheduled check, lens issue, re-fit visit
  NEW_LENSES  // a lens renewal; counting these gives the patient's program year
}

enum OrthoKStatus {
  FITTING       // lenses ordered / trial in progress, start date not set yet
  ACTIVE        // wearing, inside the follow-up sequence
  MAINTENANCE   // past 6 months, on annual review
  ON_HOLD       // paused (illness, lost lens, travel)
  DISCONTINUED
}

/// One orthokeratology fitting episode for a patient. A patient who restarts the
/// program after discontinuing gets a second enrollment rather than an edited
/// first one, so the original follow-up sequence stays intact.
model OrthoKEnrollment {
  id          String       @id @default(uuid())
  practiceId  String
  practice    Practice     @relation(fields: [practiceId], references: [id])
  patientId   String
  patient     Patient      @relation(fields: [patientId], references: [id])
  status      OrthoKStatus @default(FITTING)

  /// First night of lens wear. Every milestone due date is derived from this,
  /// so the sequence does not start until it is set.
  startDate   DateTime?

  eyes        String?      // OD | OS | OU
  lensBrand   String?
  lensDesign  String?
  /// Free-text parameters copied off the paper folder (BC/OZ/power per eye).
  lensParams  String?

  notes       String?
  startedById String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  visits OrthoKVisit[]

  @@index([practiceId, status])
  @@index([patientId])
}

/// A follow-up that actually happened. Findings stay in the paper folder; this
/// row records the date, which milestone it satisfied, and a one-line note.
model OrthoKVisit {
  id           String           @id @default(uuid())
  enrollmentId String
  enrollment   OrthoKEnrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  milestone    OrthoKMilestone
  visitDate    DateTime
  note         String?
  recordedById String?
  createdAt    DateTime         @default(now())

  @@index([enrollmentId, visitDate])
}
```

Back-relations to add: `Practice.orthoKEnrollments`, `Patient.orthoKEnrollments`.

Migration: `apps/api/prisma/migrations/<timestamp>_ortho_k_program/migration.sql`,
created with `npx prisma migrate dev --name ortho_k_program` **against the local
Docker Postgres**, not the hosted URL.

### Milestone schedule

Offsets from `startDate`, with a grace window before a milestone counts as overdue:

| Milestone | Due at | Window |
| --------- | ------ | ------ |
| `DAY_1` | +1 day | same day |
| `DAY_2` | +2 days | ±1 day |
| `WEEK_1` | +7 days | ±3 days |
| `MONTH_1` | +30 days | ±7 days |
| `MONTH_3` | +90 days | ±14 days |
| `MONTH_6` | +180 days | ±21 days |
| `SEMIANNUAL` | +180 days from the **last visit**, recurring | ±30 days |

The numbered checks count from the first night of wear. `SEMIANNUAL` is the
exception: it rolls forward from the patient's most recent visit, so someone seen
late simply has their next check pushed out by the same amount instead of
accumulating a backlog. Interim visits are excluded from that anchor, so a lens
problem squeezed in between checks does not delay the next real one; a lens
renewal does count, since the patient came in.

`INTERIM` and `NEW_LENSES` have no due date — they are logged, never scheduled,
and never satisfy a milestone.

### Program year

A patient's **year** is how many sets of lenses they have been given: the original
pair is year 1, and each `NEW_LENSES` visit starts the next. It is derived from
the visit log rather than stored, so back-dating a renewal that was missed at the
time corrects the count immediately. A renewal does **not** restart the early
sequence — the patient is already adapted — it only advances the year and rolls
the six-month clock. The table lives in one shared module, `apps/api/src/ortho-k/milestones.ts`,
mirrored in `apps/web/src/lib/orthoK.ts` so the board and the API agree on what
"overdue" means.

Derived per enrollment by a pure function — unit-tested, with no stored state to
drift out of sync:

- `nextMilestone` — first milestone with no matching visit.
- `dueDate` — `startDate + offset`.
- `state` — `DONE` | `UPCOMING` | `DUE` (inside the window) | `OVERDUE` (past window).
- `status` auto-advances `ACTIVE → MAINTENANCE` once a `MONTH_6` visit is logged.
- `programYear` — 1 + the number of `NEW_LENSES` visits.

---

## 3. API — `apps/api/src/ortho-k/`

New module registered in `app.module.ts` alongside `RecallsModule`.

`OrthoKService`

| Method | What it does |
| ------ | ------------ |
| `enroll(practiceId, dto)` | Creates the enrollment, adds `ORTHO_K` to `Patient.tags` if absent, and seeds recalls for the sequence. Rejects a second non-terminal enrollment for the same patient. |
| `board(practiceId, filters)` | The dashboard query: every non-discontinued enrollment with its patient, visits, and derived next-milestone/state. Filters: `status`, `state` (`overdue`/`due`/`upcoming`), free-text patient search. |
| `get(practiceId, id)` | One enrollment with its full visit history, newest first. |
| `update(practiceId, id, dto)` | Edits lens params, eyes, notes, status. Setting `startDate` for the first time (re)seeds the recall sequence. |
| `logVisit(practiceId, id, dto)` | Records a visit date + milestone + note; closes the matching `Recall`, schedules the next one, and advances `status` when `MONTH_6` lands. |
| `deleteVisit(practiceId, id, visitId)` | Mistyped-date correction. Re-opens the milestone's recall. |
| `notifications(practiceId)` | Counts + top rows for `OVERDUE` and `DUE` milestones — feeds the nav badge and the dashboard panel. |

`OrthoKController` (`/api/ortho-k`), matching the RBAC style of `RecallsController`:

| Route | Roles |
| ----- | ----- |
| `GET /ortho-k` (board) | any signed-in |
| `GET /ortho-k/notifications` | any signed-in |
| `GET /ortho-k/:id` | any signed-in |
| `POST /ortho-k` (enroll) | DOCTOR, TECHNICIAN, OPTICIAN, RECEPTIONIST |
| `PATCH /ortho-k/:id` | DOCTOR, TECHNICIAN, OPTICIAN |
| `POST /ortho-k/:id/visits` | DOCTOR, TECHNICIAN, OPTICIAN, RECEPTIONIST |
| `DELETE /ortho-k/:id/visits/:visitId` | DOCTOR, TECHNICIAN |

Auditing is automatic — the global `AuditInterceptor` logs these as PHI access.

### Recall integration (reuse, do not reinvent)

Milestones are written into the existing `Recall` table with
`reason = "Ortho-K — 1 week follow-up"` and so on. That puts Ortho-K follow-ups on
the existing `/recalls` queue, the dashboard "Recalls due" panel, and the patient
directory's "recall due" filter for free, with no second notification system to
maintain. `logVisit` sets the matching recall to `SCHEDULED`, so a follow-up is
never chased twice.

---

## 4. Ortho-K tab — `apps/web/src/app/ortho-k/page.tsx`

Nav entry in `AppShell.tsx` `NAV_ITEMS`, placed after **Exams** and before
**Orders**, with a new `'orthoK'` `NavIcon` (concentric-ring / corneal-topography
glyph) and no `roles` restriction. The item carries a **count badge** when
`notifications()` reports overdue milestones.

Page layout:

1. **Needs attention** (top, rendered only when non-empty) — red/amber cards for
   `OVERDUE` then `DUE` milestones: patient name, milestone, days late, phone,
   and a one-click **Log visit** action.
2. **Filter bar** — status (`Active` / `Fitting` / `Maintenance` / `On hold` /
   `Discontinued` / all), state (`Overdue` / `Due` / `Upcoming`), and a patient
   search box.
3. **Program board** — one row per enrollment:

   | Case | Patient | Started (+ year) | Last visit | Next due |
   | ---- | ------- | ---------------- | ---------- | -------- |

   **Case** is the practice's own Ortho-K numbering, counting from 1 and separate
   from the chart MRN, so the program can be filed the way the practice already
   files it. It is assigned on enrollment and editable; reusing a number in use
   is refused and names who holds it. **Next due** is written as a month and year
   (`Dec 2026`) with the milestone beneath, since a check is booked to a month
   rather than a day — an overdue one adds the exact days late and turns red.

   **Last visit** is the most recent follow-up of any kind, interim visits
   included, with the milestone name beneath the date. The milestone strip lives
   on the detail page rather than here: seven chips — `1d · 2d · 1w · 1mo · 3mo ·
   6mo · 1yr` — filled once a visit is logged, open when pending, amber when due,
   red when overdue, with interim visits shown as dots beside the sequence.

4. **Enrollment detail** (`/ortho-k/[id]`) — the milestone strip full-size for the
   **year in progress only**, so it stays readable however many years of
   six-month checks are behind the patient; an inline **Log a follow-up** form
   (date picker defaulting to today, milestone select defaulting to the next open
   milestone, note); lens parameters; status control; and a link to the chart.

   The visit log is grouped into **program years**, one collapsible block per set
   of lenses — `Year 3` open, `Year 2` and `Year 1` folded beneath it, each
   showing when that year's lenses were dispensed and how many visits it holds.
   A `NEW_LENSES` visit opens the year it belongs to rather than closing the
   previous one: the day the patient collects the next pair is day one of that
   year.

**Enroll a patient** — an inline form on the board (patient search → start date,
eyes, lens brand/design/params), matching how "New patient" already works in the
patient directory.

Supporting files: `apps/web/src/lib/orthoK.ts` (milestone table, labels, state
derivation) and `apps/web/src/components/orthok/MilestoneStrip.tsx`.

---

## 5. Patients tab — tagging glue *(dropped)*

> **Not built.** The tag itself already worked before this branch: enrolling
> applies `ORTHO_K` automatically (§3), the chip shows in the patient directory
> and on the chart, and the directory's Filters panel already filters by program.
> The polish below was dropped as unnecessary. One consequence worth knowing:
> enrollment starts only from the Ortho-K board, not from the patient chart.

The tag itself already works. Remaining work:

- **Auto-tag on enrollment** — `enroll()` adds `ORTHO_K` to `Patient.tags`. The tag
  is *not* removed on discontinuation (history matters); the chart shows the
  enrollment's status next to it.
- **Distinct chip** — style the Ortho-K badge (`badge accent`) so it reads at a
  glance in a directory row that also shows Contact lens / Glasses activity.
- **Deep link** — the Ortho-K chip on a patient row/chart links to that patient's
  enrollment on the Ortho-K board.
- **Quick filter** — a one-click "Ortho-K" chip above the directory table applying
  `tag=ORTHO_K`, next to the existing filter panel.
- Ortho-K patients stay fully in the normal directory and keep placing spectacle
  and soft-CL orders through the ordinary Orders flow. **No change to order
  routing.**

---

## 6. Notifications

Three surfaces, one source (`GET /ortho-k/notifications`):

1. **Nav badge** on the Ortho-K item — count of overdue milestones.
2. **Dashboard panel** — a new `'orthoK'` key in `DASHBOARD_PANEL_KEYS` /
   `DASHBOARD_PANEL_LABELS` ("Ortho-K follow-ups"), so staff can show or hide it
   like every other panel. Lists the next few overdue/due follow-ups with a link
   through to the board.
3. **Recalls queue** — inherited automatically from the `Recall` rows written in §3.

Day-1 and Day-2 checks are the sharp edge: they come due within 48 hours of the
fitting, so an enrollment created with a `startDate` of today must appear on the
board and dashboard **immediately**, not after an overnight job. Everything is
derived at query time, so it does.

Outbound patient messaging stays out of scope, matching the existing recall rule
that outbound text must not carry clinical detail.

---

## 7. Tests

- `apps/api/src/ortho-k/milestones.spec.ts` — due-date arithmetic, window
  boundaries, `DUE` vs `OVERDUE`, annual recurrence, `INTERIM` never satisfying a
  milestone.
- `apps/api/src/ortho-k/ortho-k.service.spec.ts` — enroll auto-tags the patient and
  seeds recalls; duplicate active enrollment rejected; `logVisit` closes the right
  recall and advances `MONTH_6 → MAINTENANCE`; `deleteVisit` reopens it;
  cross-practice access returns 404 (matching `RecallsService`).

---

## 8. Build order

1. Schema + migration + `milestones.ts` and its spec. *(no UI yet)*
2. `OrthoKService` / `OrthoKController` / module wiring + service spec.
3. Seed a couple of Ortho-K enrollments in `prisma/seed.ts` so the board has data.
4. `MilestoneStrip` + `/ortho-k` board + enroll modal.
5. `/ortho-k/[id]` detail + log-visit form.
6. Nav item, nav badge, dashboard panel.
7. ~~Patients-tab tag glue (§5)~~ — dropped.
8. `docs/06-code-reference.md` and the `README.md` module list updated.

Steps 1–3 are backend-complete and independently verifiable; the board is built
against real seeded data from step 4 onward.

---

## 9. Open questions

- **Annual reviews** — recur indefinitely, or stop after the first year and rely on
  the ordinary annual-exam recall? Plan assumes indefinite yearly recurrence.
- **Overnight vs daytime wear** — a field on the enrollment, or out of scope?
  Currently folded into free-text `lensParams`.
- **Fitting fees** — should enrolling a patient also draft the `FITTING_ORTHO_K`
  fee/order, or is that kept manual in the Orders tab? Plan keeps it manual.
