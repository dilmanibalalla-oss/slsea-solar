# SLSEA Solar Generation API

SLSEA Solar Generation API is a Node.js Express service backed by MongoDB for tracking solar photovoltaic generation across Sri Lanka. The API provides immutable time-series generation readings ingestion for hardware meters, jurisdiction-scoped access control for analysts, administrative metadata CRUD, real-time operational generation summaries, and interactive Swagger UI / OpenAPI 3.0 documentation.

---

## 🛠️ Stack & Architecture

- **Runtime**: Node.js (>=20)
- **Framework**: Express 5
- **Database**: MongoDB / Mongoose ODM
- **Authentication**: JWT (HS256) & Scrypt password hashing
- **Deployment**: Vercel Serverless Function & Node.js standalone server
- **Documentation**: OpenAPI 3.0.3 specification served at `/solar/v1/openapi.json` and interactive Swagger UI at `/solar/v1/docs`

---

## 🚀 Quick Start

### 1. Environment Setup

Copy `.env.example` to `.env` and configure environment variables:

```bash
cp .env.example .env
```

Key environment variables:
- `PORT`: Server port (default: 3000)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT signing (at least 32 bytes)
- `PUBLIC_API_URL`: Canonical public API origin (e.g. `https://slsea-solar.vercel.app`)
- `SEED_ADMIN_PASSWORD`: Password for admin account seed (at least 16 chars)
- `SEED_ANALYST_PASSWORD`: Password for analyst accounts seed (at least 16 chars)
- `SEED_CONFIRM`: Must match the target database name to confirm seeding

### 2. Install Dependencies

```bash
npm install
```

### 3. Syntax & Unit Testing

```bash
# Run syntax check across all JavaScript files
npm run lint

# Run unit and integration tests
npm test
```

### 4. Local Development Server

```bash
npm run dev
```

Interactive Swagger UI will be available at: `http://localhost:3000/solar/v1/docs`

---

## 🔐 Security & Credential Management

- **Public Credentials**: Real account passwords, secrets, or live JWT tokens are never exposed in OpenAPI examples or documentation. Placeholders (e.g., `"YOUR_ADMIN_PASSWORD"`) are used.
- **Credential Rotation**: If default seed credentials were used in pre-production or public environments, password rotation must be executed immediately via `SEED_ADMIN_PASSWORD` / `SEED_ANALYST_PASSWORD` environment variable updates.
- **Device Tokens**: Hardware devices do not authenticate via `/auth/token`. Device tokens are provisioned out-of-band via CLI:
  ```bash
  npm run token <installationId>
  ```
  Issued device tokens have `sub: <installationId>`, `kind: "device"`, and scope `installation-write`. Ingestion (`POST /installations/{id}/readings`) enforces subject matching.

---

## 📊 Summary of Implemented Features

1. **Swagger Server Selection**: Server selection defaults to the current environment URL dynamically on Vercel (`/solar/v1`), ensuring "Try it out" works seamlessly both locally and when deployed.
2. **Immutable Fields**: `province` (on District), `district` (on Substation), `substation` and `meterId` (on Installation) are immutable. Modification attempts return `409 PARENT_IMMUTABLE` or `409 METER_ID_IMMUTABLE`.
3. **Permissions & Jurisdiction**: Analyst access is strictly scoped to assigned jurisdictions (`national`, `province`, `district`). Out-of-jurisdiction access returns `404 NOT_FOUND` to prevent resource existence enumeration.
4. **Reading Ingestion Rules**: Max 5-minute future clock skew (`400 FUTURE_TIMESTAMP`), max 120% capacity power (`400 IMPLAUSIBLE_POWER`), duplicate timestamp prevention (`409 DUPLICATE_RESOURCE`), and monotonic cumulative energy counter bounds (`409 ENERGY_COUNTER_DECREASE`).
5. **Operational Summaries**: District summaries are computed in fixed `Asia/Colombo` (UTC+5:30) operational timezone with 30-minute freshness threshold and baseline energy coverage evaluation.
6. **Optimistic Locking & Caching**: Resources use strong `ETag` generation. Updates and deletes require `If-Match` (`428 PRECONDITION_REQUIRED` when missing; `412 PRECONDITION_FAILED` on conflict). Authenticated GET representations return `Cache-Control: private, no-cache`, while token issuance and auth failures use `Cache-Control: no-store`.

---

## 📄 API Documentation

- Interactive Swagger UI: `/solar/v1/docs`
- OpenAPI Spec: `/solar/v1/openapi.json`
- Deployment Status: `/solar/v1/status`
- Health Readiness: `/solar/v1/health`
