# Optical Store EHR

Electronic health records for a single-location optical practice (1–2 doctors): patient
charts, scheduling, eye exams, spectacle and contact-lens prescriptions, insurance records,
optical orders, recalls, inventory, customizable reports, and a full audit trail. Designed
for HIPAA-supporting deployment on Microsoft Azure.

## Stack

| Layer     | Technology |
| --------- | ---------- |
| Frontend  | Next.js 14 (App Router), React 18, TypeScript |
| Backend   | NestJS 10 modular monolith, TypeScript |
| Database  | PostgreSQL 16 with Prisma ORM |
| Documents | PDF generation (pdfkit) + Azure Blob Storage |
| Cloud     | Azure App Service, PostgreSQL Flexible Server, Blob Storage, Key Vault, Entra ID |

## Repository layout

```
apps/api      NestJS API (auth, audit, patients, insurance, scheduling,
              encounters, prescriptions, reports, documents, orders,
              inventory, recalls, tasks)
apps/web      Next.js staff web application
infra         Bicep template for the Azure landing zone
docs          Discovery, platform foundation, and launch documentation
.github       CI/CD pipeline (verify -> deploy staging slot -> swap prod)
```

## Local development

Prerequisites: Node.js 20+, Docker (for PostgreSQL).

```bash
# 1. Start the database
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure the API environment
copy apps\api\.env.example apps\api\.env

# 4. Create the schema and seed synthetic dev data
cd apps/api
npx prisma migrate dev --name init
npm run seed
cd ../..

# 5. Run both apps (two terminals)
npm run dev:api    # http://localhost:3001
npm run dev:web    # http://localhost:3000
```

Dev sign-ins (password `test12340`): `doctor@dev.local`, `tech@dev.local`,
`optician@dev.local`, `frontdesk@dev.local`, `admin@dev.local`.

Run tests with `npm test`.

## Production deployment (summary)

1. Confirm the Microsoft BAA covers the subscription (Product Terms / DPA).
2. Deploy `infra/main.bicep` per environment (`rg-ehr-staging`, `rg-ehr-prod`).
3. Store `DATABASE_URL` and `JWT_SECRET` in Key Vault; App Service reads them through its
   managed identity.
4. Configure Entra ID app registration + Conditional Access (MFA) for staff sign-in.
5. Wire GitHub environments (`staging`, `production`) with OIDC federated credentials;
   pushes to `main` deploy to the staging slot and swap after manual approval.

See [docs/02-platform-foundation.md](docs/02-platform-foundation.md) for the full landing
zone and [docs/04-launch-checklist.md](docs/04-launch-checklist.md) for go-live gates.

## Code documentation

For a module-by-module breakdown of every service method, API route, and frontend page,
see **[docs/06-code-reference.md](docs/06-code-reference.md)**. Source files also carry
`/** ... */` JSDoc comments above classes and public functions.

## Compliance notes

- HIPAA compliance is a shared responsibility: this codebase implements technical
  safeguards (RBAC, MFA-ready identity, audit logging, immutable signed records, automatic
  logoff, encrypted storage), but the practice must also complete a security risk analysis,
  policies, training, and vendor BAAs.
- First release stores insurance and clinical records only. Claims (X12), e-prescribing,
  and FHIR/USCDI export are deferred integrations — see
  [docs/05-future-integrations.md](docs/05-future-integrations.md).
- No payment-card data is stored anywhere in this system.
