# Hardening and Launch Checklist

Every item must be checked and dated before the first live patient record is entered.
Where a drill or review is involved, keep the evidence (screenshots, restore logs,
sign-offs) in the practice's compliance binder.

## 1. Security

- [ ] HIPAA Security Risk Analysis completed and documented (administrative requirement,
      45 CFR 164.308(a)(1)); privacy/security officer designated.
- [ ] Microsoft BAA coverage confirmed for the production subscription; every Azure service
      in use appears on the BAA in-scope list (App Service, PostgreSQL Flexible Server,
      Blob Storage, Key Vault, Entra ID, Monitor).
- [ ] Entra ID Conditional Access enforces MFA for all EHR users; break-glass account
      documented and sealed.
- [ ] Application roles assigned per person (no shared logins); least-privilege review of
      each staff member's role completed.
- [ ] Database has no public endpoint; storage account denies public access; TLS 1.2+
      everywhere; FTP disabled.
- [ ] Secrets exist only in Key Vault; confirm none in source control, app settings, or CI
      logs.
- [ ] Automatic logoff verified: idle session ends within 15 minutes client-side and the
      JWT expiry (15 min) is enforced server-side.
- [ ] Threat-model pass on the API: verified role gates on every mutating endpoint,
      cross-practice access attempts return 404, and the audit interceptor records reads
      of PHI routes.
- [ ] Application Insights telemetry inspected: no PHI in request URLs, traces, or
      exception payloads.

## 2. Backup and restore drill

- [ ] PostgreSQL point-in-time restore executed into the staging environment; application
      boots against the restored copy and a spot-check of patients/encounters matches.
- [ ] Blob soft-delete recovery tested for a deleted report PDF; hash matches the
      GeneratedReport record.
- [ ] Weekly logical export (pg_dump) job verified and restorable.
- [ ] Restore runbook written with owner, expected RTO (≤ 4h) and RPO (≤ 1h), and tested
      timings recorded.

## 3. Downtime procedure

- [ ] Paper downtime kit prepared: blank exam forms matching the active template, Rx pads,
      order forms.
- [ ] Re-entry procedure documented (who keys the paper records in, within what window).
- [ ] Status alerting configured (App Service availability test + alert to practice phone).

## 4. Usability and accessibility

- [ ] Each role walks its daily workflow in staging with synthetic data (front desk:
      register/book/check-in; tech: pre-testing; doctor: exam/sign/Rx; optician: order to
      dispense) — acceptance criteria from docs/01-discovery.md §6 all pass.
- [ ] Keyboard-only pass on login, patient search, exam form, and order queue.
- [ ] Automated accessibility scan (e.g. axe) run on the main pages; contrast and label
      findings resolved.
- [ ] Print output reviewed by a doctor: spectacle and CL Rx PDFs are clinically correct
      and legible.

## 5. Data migration (if replacing paper or a legacy system)

- [ ] Migration scope agreed (active patients, open orders, last N years of exams).
- [ ] Test migration into staging validated by staff spot-checks (names, DOBs, Rx values).
- [ ] Legacy data retained per state retention rules; disposal (if any) documented.

## 6. Training and pilot

- [ ] Every staff member trained on their role, on privacy expectations, and on downtime
      procedure; attendance recorded.
- [ ] One-week pilot with a limited schedule; issues triaged daily.
- [ ] Go/no-go review held with the doctors; sign-off recorded before full cutover.

## 7. Ongoing operations (recurring)

| Cadence   | Task |
| --------- | ---- |
| Weekly    | Review error alerts and failed sign-in attempts |
| Monthly   | Export audit log to immutable storage; review a sample of PHI access |
| Quarterly | Restore drill; access review (roles vs. staff list); dependency updates |
| Annually  | Refresh the security risk analysis and staff privacy training |
