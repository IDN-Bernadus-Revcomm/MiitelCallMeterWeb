# MiiTel CallMeter — Web

MaterialM-inspired React + Tailwind dashboard for CallMeter. The frontend
contains call-charge overview, CDR Explorer, and CDR file upload preview.
The server proxies authenticated requests to the existing NestJS API; the
backend API token is never included in the browser bundle.

## Deploy to Render

Create a **Node Web Service** (not a Static Site) from the Web repository.

| Setting | Value |
|---|---|
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/health` |
| NODE_VERSION | `22.23.3` |
| HOST | `0.0.0.0` |
| BACKEND_URL | `https://miitelcallmeterapi.onrender.com` |
| BACKEND_API_TOKEN | The same API_TOKEN configured in the NestJS service |
| APP_ACCESS_TOKEN | A newly generated random access secret (at least 32 characters) |
| ENABLE_CDR_IMPORT | `false` |
| DEMO_MODE | `false` |

Render supplies PORT automatically. Keep both tokens in secret environment
variables; do not use `VITE_*` variable names for secrets. Users sign in
with the separate APP_ACCESS_TOKEN, not the backend token.

This is an internal developer prototype with an access gate and signed
HttpOnly sessions. Configure identity-based user authorization before
production use. The dashboard clearly labels database results as simulations.
Import is disabled initially and must be enabled explicitly on both services.

Customer profiles can be created or edited from Customers, including creating
a customer directly from Upload CDR. Set a distinct `ADMIN_ACCESS_TOKEN`
(minimum 32 characters) on the web service and `MASTER_WRITE_ENABLED=true`
on the backend only when enabling writes. Sign in using the admin key to
edit; the existing workspace key can view only. This is a temporary shared
admin credential, not individual-user RBAC. No lifecycle status changes,
number identity changes are exposed by the customer forms. Number Inventory
supports registration, lifecycle updates, assign/release, and translation
creation/closure using the existing database triggers. Vendor profiles are
editable; call rate cards and customer discounts can be registered as inactive
drafts or new revisions after the database guard migration 010A is applied.
Existing rate records remain unchanged when creating drafts. Admins can
explicitly publish vendor and selling drafts, replace a single overlapping
earlier exact-scope rate, or end a rate's effective period without rewriting
historical pricing. The Rating Simulation uses the existing active-rate engine;
customer discount approval still needs individual user identity.
CDR Explorer also provides a separate Active Rate Preview, bounded to 25 CDRs
per page; it does not rewrite the historical simulation or save rating results.

## Deploy to Vercel

Use the **Vite** framework preset. The repository includes `vercel.json`
and real Vercel Functions under `api/`, so login and the private backend proxy
work on Vercel without running an Express listener.

Set the following in Vercel Project Settings > Environment Variables
for the Production environment, then redeploy:

- `BACKEND_URL=https://miitelcallmeterapi.onrender.com`
- `BACKEND_API_TOKEN`: the existing Render API_TOKEN, server-side only
- `APP_ACCESS_TOKEN`: separate random access key, minimum 32 characters
- `ENABLE_CDR_IMPORT=false`

Do not prefix secrets with `VITE_`. Check `/api/session`: the route should
return JSON with `configured: true` before signing in.

Vercel Functions have a default request body limit of 4.5 MB. The upload UI
uses same-origin proxy uploads up to 4 MB; larger files up to 32 MB are sent
directly to the existing Render API on the production CallMeter domain with a
short-lived, scope-bound upload permit (the backend API token stays server-side).
The explicit source timezone/currency and previewed file hash accompany import.
To enable real imports, apply migration 010B, set backend
`CDR_IMPORT_ENABLED=true` and frontend `ENABLE_CDR_IMPORT=true`, then sign in
as admin. Import History lists completed and rolled-back batch attempts and
legacy stored CDR groups. No final billing or invoice is posted by import.

## Local development

```sh
npm ci
npm run build
DEMO_MODE=true npm start
```

Open `http://127.0.0.1:4173`. Demo mode works only on loopback, displays
synthetic aggregates, and cannot upload to the database.

For live API development, copy `.env.example` to `.env` and configure
the server-side secrets, then run `npm start`.

`npm test` verifies session signing and expiry.

No customer CDR files, real call-charge snapshots, or private credentials
are included in this repository.
