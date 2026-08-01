# Future Integrations: Claims, e-Prescribing, FHIR

These integrations are intentionally out of the first release. The core schema stays
integration-agnostic; each integration gets an adapter module that maps internal records to
the external format at the boundary. Nothing in the clinical schema should be reshaped to
match X12, NCPDP, or FHIR — adapters own that translation.

## Reserved integration points (already in the codebase)

- `InsurancePolicy` carries payer/member/group/relationship data sufficient to build X12
  270 (eligibility) and 837P (professional claim) segments.
- `Encounter.diagnosisCodes` (ICD-10) and `Encounter.procedureCodes` (CPT) provide the
  superbill for claim lines.
- `Prescription` versioning and prescriber NPI/license fields support both Rx export and
  e-prescribing identity requirements.
- The audit framework records EXPORT actions, which claims/eRx transmissions must log.

## 1. Insurance eligibility and claims (first integration to add)

Approach: contract a healthcare clearinghouse rather than direct payer connections.
Typical candidates for a small practice: Availity, Change Healthcare/Optum, or a
vision-focused service; for vision plans (VSP, EyeMed) evaluate their direct provider APIs.

Build order:
1. `ClaimsModule` adapter with its own tables (`Claim`, `ClaimLine`, `RemittanceAdvice`)
   referencing — not modifying — encounters and insurance policies.
2. Eligibility check (270/271) triggered from the insurance panel.
3. Claim generation (837P) from a signed encounter's superbill; statuses
   `draft → submitted → accepted/rejected → paid/denied`, with 835 remittance import.
4. Clearinghouse BAA executed before any live claim.

## 2. Electronic prescribing (medication eRx)

Optometrists prescribing medications (e.g. glaucoma drops, antibiotics) need a
Surescripts-certified network connection. Building direct Surescripts certification is not
economical for one store; integrate an embedded eRx vendor (e.g. DoseSpot, MDToolbox,
RXNT) via their API/iframe.

Requirements to verify at contract time: state board rules, EPCS (controlled substances)
identity-proofing if needed, vendor BAA, and prescriber NPI/DEA enrollment.
Note: spectacle/CL prescriptions are not eRx — they remain native reports in this system.

## 3. FHIR / USCDI export and ONC certification

- Not required while the system is used internally by the practice that built it.
- Becomes relevant if: the practice joins a CMS program requiring CEHRT, sells the software
  to other practices, or needs standardized exchange with medical EHRs.
- Path: add a read-only FHIR R4 API (US Core profiles for Patient, Encounter,
  DiagnosticReport, VisionPrescription) as an adapter over the existing schema; assess ONC
  Health IT certification (§170.315 criteria incl. g(10) standardized API) only when a
  concrete business driver exists.
- Patient right-of-access exports today are served by the JSON chart export
  (`GET /api/patients/:id/export`); a patient-friendly PDF/CCD rendering is a good interim
  improvement before full FHIR.

## 4. Patient communications

Appointment reminders and recall outreach currently stay inside the app (work queues).
When automating SMS/email:
- Use a vendor that signs a BAA (e.g. Azure Communication Services, Twilio with BAA).
- Keep message content to appointment logistics only — no diagnoses, no Rx values.
- Record consent and honor the patient's `preferredContact`.

## Sequencing recommendation

1. Eligibility (270/271) — highest front-desk time savings, lowest clinical risk.
2. Claims (837P/835) — after eligibility is stable.
3. Automated reminders — quick win once a BAA-backed messaging vendor is chosen.
4. Medication eRx — when prescription volume justifies vendor cost.
5. FHIR/ONC — only with a concrete regulatory or business driver.
