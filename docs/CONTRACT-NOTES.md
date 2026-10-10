# Solar API contract notes

## Specified contract (implemented)

- Prefix `/solar/v1` on every API route.
- Integer public IDs and snake_case fields (not Mongo ObjectIds or camelCase).
- Login: `POST /solar/v1/auth/login` with `username` / `password`; JWT `UserAuth`.
- Ingestion: `POST /solar/v1/installations/{id}/readings` with `X-API-Key` only.
- Four roles: `admin`, `national`, `province`, `district` with the documented scopes and jurisdiction filters.
- Nested read paths such as `/solar/v1/provinces/{id}/solar/v1/districts`.
- Bare arrays for collections; envelope only for reading history.
- Installation `DELETE` is a **soft delete** (record kept, `200` JSON body).
- Administrator metadata CRUD on provinces, districts, substations, and installations.
- Existing user password hashes are not reset; missing role accounts are created from env vars.

## Account setup

1. Set `MONGODB_URI`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`.
2. For **new** role accounts only, set `ACCOUNT_<ROLE>_USERNAME` and `ACCOUNT_<ROLE>_PASSWORD` (or `SEED_ADMIN_PASSWORD` / `SEED_ANALYST_PASSWORD` as fallbacks).
3. `npm run seed` rebuilds geography/readings (requires `SEED_CONFIRM=<database name>`) and **does not delete users**.
4. `npm run provision-accounts` only adds missing role accounts / fills missing profile fields.
5. `npm run api-key -- <installation-id>` prints that installation’s `X-API-Key`.
6. Swagger examples (`national_admin` / `Admin@123`) are documentation only and are not used as live credentials.

## Unresolved items in the source contract (not “fixed” silently)

- Every documented JSON error example is the same `Province not found` payload, including 400/401/403 on other resources. Runtime errors use appropriate messages; Swagger examples stay generic as specified.
- History `next` example uses `/solar/v1/installations/1/readings?...` and the implemented path is `/solar/v1/installations/{id}/readings`. Runtime `next`/`previous` use that path.
- No numeric/length bounds were documented; the implementation only requires types needed to run.
- POST `Location` has no documented GET for a single reading; the header is set to the request URL and is not given a fake example.
- `last_reading` has no nullable marker; the API returns `null` when an installation has no readings so GET composite still works.

## Local launch

```bash
npm install
# configure src/.env or .env (see .env.example)
npm run seed
npm run dev
```

- API: http://localhost:3000/solar/v1
- Swagger UI: http://localhost:3000/solar/v1/docs
- Login, then Authorize with `Bearer <access_token>`
- Ingest readings with header `X-API-Key` from `npm run api-key -- 1`
