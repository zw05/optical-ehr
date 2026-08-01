# Platform Foundation: Azure Landing Zone

All services below are HIPAA-eligible and covered by the Microsoft BAA (provided automatically
through the Microsoft Product Terms / Data Protection Addendum). Confirm BAA coverage in the
Azure tenant before any PHI is stored.

## Environments

| Environment | Purpose                          | Data                    |
| ----------- | -------------------------------- | ----------------------- |
| dev         | Local development                | Synthetic data only     |
| staging     | Pre-production validation        | Synthetic/de-identified |
| production  | Live practice                    | PHI                     |

Each environment is a separate resource group (`rg-ehr-dev`, `rg-ehr-staging`, `rg-ehr-prod`)
in a single region (default `eastus2`). Production resources are deployed with the Bicep
template in [`infra/main.bicep`](../infra/main.bicep).

## Services

- **Azure App Service (Linux, P0v3 or higher, always-on)** — two apps: `app-ehr-web`
  (Next.js) and `app-ehr-api` (NestJS). Deployment slots (`staging` slot) for zero-downtime
  swaps. HTTPS only, TLS 1.2 minimum, FTP disabled.
- **Azure Database for PostgreSQL Flexible Server** — `B2s` initially (scale up as needed),
  private access (VNet integration), storage encryption on by default, automated backups
  with 35-day retention, point-in-time recovery, optional zone-redundant HA later.
- **Azure Blob Storage** — private containers `documents` (uploads/scans) and `reports`
  (generated PDFs). Public access disabled, soft delete + versioning enabled, access via
  short-lived user-delegation SAS from the API only.
- **Microsoft Entra ID** — workforce identity. The API validates Entra-issued JWTs (OIDC).
  Conditional Access policy requires MFA for all users of the EHR app registration.
  Application-level roles (doctor/technician/optician/receptionist/admin) live in the EHR
  database and are mapped from the Entra object ID at first sign-in by an administrator.
- **Azure Key Vault** — database connection string, storage account keys, JWT signing
  material for dev fallback, report-signing secrets. App Services access it with managed
  identities; no secrets in app settings or source control.
- **Azure Monitor / Application Insights** — availability, performance, and security alerts.
  Telemetry processors strip request bodies and URLs of identifiers; PHI never appears in
  logs, traces, or exceptions (enforced in code by the logging sanitizer).

## Network

- VNet with subnets: `snet-app` (App Service VNet integration) and `snet-db`
  (PostgreSQL delegated subnet). The database has no public endpoint.
- Storage account restricted to the VNet + Azure services via service endpoints.
- Front door: App Service built-in HTTPS is sufficient at this scale; add Azure Front Door +
  WAF if the practice later exposes a patient portal.

## Identity and access

- Staff sign in with Entra ID + MFA. Sessions time out after 15 minutes of inactivity
  (enforced client- and server-side).
- Managed identities: `app-ehr-api` → Key Vault (get secrets), Storage (Blob Data
  Contributor), PostgreSQL (optional Entra auth).
- Break-glass: one emergency-access Entra account excluded from Conditional Access,
  credentials in a sealed physical envelope, use audited.

## Backups and recovery

- PostgreSQL automated backups (35 days) + weekly `pg_dump` logical export to a separate
  storage account with immutability policy (90 days).
- Blob soft delete (30 days) + versioning.
- Restore drill: quarterly, into staging, following [`docs/04-launch-checklist.md`](04-launch-checklist.md).
- RPO ≤ 24h (target ≤ 1h via PITR); RTO ≤ 4h.

## CI/CD

GitHub Actions ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):
1. On PR: install, lint, type-check, unit tests, Prisma schema validation.
2. On merge to `main`: build both apps, deploy to the staging slot, run smoke tests,
   manual approval gate, slot swap to production.
3. Secrets via OIDC federated credentials to Azure (no long-lived credentials in GitHub).

## Audit framework

- Every API mutation and PHI read is written to the `AuditEvent` table by the global audit
  interceptor (actor, patient, action, entity, timestamp, IP, session).
- Audit rows are append-only: no UPDATE/DELETE grants for the application role; a monthly
  export to immutable blob storage provides tamper-evident retention (6 years).
