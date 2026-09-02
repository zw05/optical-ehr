# Discovery: Workflows, Roles, Templates, and Compliance Boundary

Scope: one optical store, 1–2 doctors (optometrists), plus support staff. Managed cloud web
application hosted on Azure, United States jurisdiction (HIPAA applies). First release stores
insurance and clinical records only — no claim submission and no electronic prescribing.

## 1. Staff roles

| Role          | Primary responsibilities                                                | Access level |
| ------------- | ----------------------------------------------------------------------- | ------------ |
| Doctor        | Perform exams, sign encounters, finalize prescriptions, addenda          | Full clinical read/write, sign-off |
| Technician    | Pre-testing (VA, IOP, auto-refraction), history intake                   | Clinical write on assigned encounter sections; no sign-off |
| Optician      | Spectacle/contact-lens orders, dispensing, measurements, remakes         | Orders read/write, prescription read-only |
| Receptionist  | Scheduling, check-in, demographics, insurance records, recalls           | Demographics/scheduling read/write; clinical read limited to flags |
| Administrator | User management, templates, reports configuration, exports, audit review | All modules; sole holder of account and permission management; clinical writes still attributed individually |

Store settings are the exception to the table above: maintaining the practice's own catalogs
(lens and contact lens pricing, frames, accepted insurances, billing codes) is front-of-house
work, so every signed-in role may do it by default. An administrator can grant or revoke any
of those capabilities for an individual without changing their role. Staff accounts and
permissions remain administrator-only.

Every role authenticates with MFA. All PHI access is audit-logged with actor, patient,
timestamp, action, and session.

## 2. Core workflows

### 2.1 Front desk
1. Patient calls or walks in → search patient (name, DOB, phone) → create or update demographics.
2. Capture insurance: payer, member/group ID, subscriber relationship, effective dates, card scan.
3. Book appointment: provider, appointment type, duration, notes. Statuses:
   `scheduled → confirmed → checked_in → in_progress → completed` (or `cancelled` / `no_show`).
4. Recall list drives outbound reminders (content limited: no diagnosis or Rx detail in messages).

### 2.2 Exam (clinical)
1. Technician opens the encounter created at check-in and records pre-testing.
2. Doctor completes the exam using the configured template (see §3), records assessment/plan
   and diagnosis codes, then signs the encounter. Signing freezes the record; later corrections
   are signed addenda only.
3. Doctor finalizes spectacle and/or contact-lens prescription(s). Finalized prescriptions are
   immutable and versioned; a correction issues a new version superseding the old one.
4. Printable/exportable reports (exam summary, Rx) are generated from the locked template
   version and stored with a hash and access history.

### 2.3 Optical (dispensary)
1. Optician creates a spectacle order linked to a finalized Rx: frame, lens design/material/
   coatings, measurements (PD, seg height, OC, vertex, pantoscopic tilt, wrap), lab, pricing,
   deposit. Statuses: `draft → ordered → at_lab → received → verified → dispensed`
   (plus `remake` and `cancelled`).
2. Contact-lens flow: trial lenses → follow-up → finalized CL Rx → supply order with
   fulfillment status.
3. Basic inventory tracks frames and CL trial stock (SKU, quantity, cost, retail).

### 2.4 Practice operations
- Task queue (callbacks, order follow-ups, recall outreach).
- Recall schedules per patient (e.g., annual exam, CL follow-up).
- Data export (per-patient record export; full backup export by administrator).

## 3. Exam template (default, customizable)

Sections are configurable per practice (show/hide, required/optional, custom fields in
designated JSONB sections), but validated fields keep clinical integrity:

1. Chief complaint & HPI
2. Medical / ocular history, family history, medications, allergies
3. Visual acuity (distance/near, aided/unaided, OD/OS/OU)
4. Refraction: objective (auto/retinoscopy) and subjective — sphere, cylinder, axis, add,
   prism, base per eye
5. Keratometry / topography values
6. Pupils, EOMs, confrontation visual fields, cover test
7. IOP (method, time, values per eye)
8. Slit lamp findings (lids/lashes, conjunctiva, cornea, anterior chamber, iris, lens)
9. Posterior segment (C/D ratio, macula, vessels, periphery; dilation status and agents)
10. Assessment & plan, diagnosis codes (ICD-10), procedure codes (CPT) for the superbill
11. Sign-off (provider, timestamp) and addenda

## 4. Reports

- Spectacle Rx report: patient, provider + license, exam date, expiration, OD/OS sphere/cyl/
  axis/add/prism, PD, remarks, signature block, practice branding.
- Contact-lens Rx report: brand/material, base curve, diameter, power (sph/cyl/axis), add,
  wear/replacement schedule, expiration.
- Exam summary report: configurable section visibility for referrals or patient copies.
- All reports render from a versioned template; the issued PDF is stored immutably in Blob
  Storage with SHA-256 hash, template version, and access log.

## 5. Compliance boundary (first release)

In scope:
- HIPAA Security Rule technical safeguards: MFA, RBAC, encryption in transit/at rest,
  audit logging, automatic logoff, backup/restore.
- HIPAA Privacy Rule support: consent tracking, patient record export (right of access),
  amendment workflow via addenda.
- Microsoft BAA covering App Service, PostgreSQL Flexible Server, Blob Storage, Key Vault,
  Entra ID, Monitor.

Out of scope (deferred; adapters reserved):
- Insurance eligibility/claims (X12 270/271, 837P, 835) via clearinghouse.
- Electronic prescribing (Surescripts-certified vendor).
- FHIR/USCDI export and ONC certification — not required for an internal single-practice
  system unless the practice joins a CMS program that requires CEHRT. Confirm before any
  such enrollment.
- Payment-card storage — never stored; use a PCI-compliant terminal/provider.

## 6. Acceptance criteria (MVP)

1. A receptionist can register a patient, record insurance, and book an appointment in under
   3 minutes.
2. A technician and doctor can complete and sign an exam; the signed record is immutable and
   an addendum trail works.
3. A doctor can finalize spectacle and CL prescriptions; reports print with practice branding
   and the stored PDF matches its hash.
4. An optician can run an order from draft to dispensed, including a remake.
5. Every PHI create/read/update/export/print is present in the audit log with actor, patient,
   timestamp, and action.
6. A restore drill from automated backups succeeds in staging.
7. Role restrictions verified: e.g., a receptionist cannot open exam clinical detail; an
   optician cannot edit a prescription.
