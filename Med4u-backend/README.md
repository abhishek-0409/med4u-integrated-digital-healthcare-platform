<h1 align="center">Med4U — Backend</h1>

<p align="center">
  Healthcare API (student/portfolio project) built with NestJS, PostgreSQL, Redis, WebRTC signaling & Socket.IO
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-336791?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
</p>

---

## What is Med4U?

Med4U digitizes the complete patient-doctor journey for the Indian healthcare market:

**Discovery → Booking → Consultation → Prescription → Follow-up**

Roles: **patient**, **doctor**, **pharmacist**, **admin**. Self-service login only ever creates patients; staff roles are granted with `npm run user:grant-role`.

> **Status:** integrated and tested at the API level, **not production-ready**. See [Status and limitations](#status-and-limitations).

---

## Architecture

```
Client (React Native)
        │
        ├── REST API (NestJS + Zod + JWT)
        ├── WebSocket (Socket.IO — real-time updates + WebRTC signaling)
        │
        ├── PostgreSQL 15   — 13 tables, atomic booking transactions
        ├── Redis 7         — OTP TTL, rate limiting, room state, token blacklist
        ├── Encrypted local files — prescription uploads (Cloudinary config exists but is unused)
        ├── Twilio SMS      — OTP delivery (adapter pattern — swappable)
        └── Firebase Admin  — push notifications via FCM
```

### Clean Architecture
```
Controller → Service → Repository → Database
     ↓
  Zod Pipe (validation)
  JWT Guard (authentication)
  Roles Guard (RBAC)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 10 + TypeScript 5 (strict) |
| Database | PostgreSQL 15 + TypeORM |
| Cache / Ephemeral | Redis 7 (ioredis) |
| Real-time | Socket.IO 4 (WebSocket + long-poll fallback) |
| Auth | JWT (HS256) + Refresh Token Rotation + bcrypt |
| File Storage | Encrypted local disk (dev); object storage needed for production |
| SMS | Twilio (adapter pattern) |
| Push | Firebase Admin SDK → FCM |
| Validation | Zod |
| Logging | Winston (structured JSON) |
| Docs | Swagger / OpenAPI 3.0 |
| Container | Docker + Docker Compose |

---

## Modules (9)

| Module | Responsibility |
|--------|---------------|
| `auth` | OTP login, JWT issue, refresh token rotation, logout |
| `users` | Patient profile, medical history |
| `doctors` | Registration, availability, time slots, verification |
| `appointments` | Atomic slot booking, cancellation, rescheduling |
| `consultations` | WebRTC room management, signaling via Socket.IO |
| `prescriptions` | Patient upload, pharmacist review, authorized file download |
| `medicines` | 35 real medicines across 7 categories |
| `labs` | 37 lab tests, home collection booking |
| `notifications` | FCM push notifications, admin broadcasts |

---

## Database (13 Tables)

```
users            doctors          appointments      time_slots
prescriptions    otp_codes        sessions          reviews
notifications    lab_tests        lab_bookings      medicines
medical_history
```

Soft deletes on all tables. Atomic `SELECT FOR UPDATE` on slot booking.

---

## Key Features

### OTP Authentication (no passwords)
- Patient enters phone → 6-digit OTP sent via Twilio SMS
- OTP stored as **bcrypt hash** in Redis with **5-minute TTL**
- Rate limited: **3 OTPs per 10 minutes per phone number**
- On verify → issues Access Token (15 min) + Refresh Token (7 days)

### Refresh Token Rotation (theft detection)
- Every refresh invalidates the old token and issues a new pair
- Logout blacklists the refresh token in Redis
- Double-use of a refresh token → both sessions invalidated → theft detected

### Double Booking Prevention
```sql
BEGIN;
  SELECT * FROM time_slots WHERE id = $1 FOR UPDATE;
  -- row locked — concurrent bookings queue here
  UPDATE time_slots SET status = 'booked' WHERE id = $1;
  INSERT INTO appointments (...) VALUES (...);
COMMIT;
```

### WebRTC Video Consultation (P2P — zero server media cost)
```
Patient ──── webrtc:offer ────► NestJS Gateway ──── webrtc:offer ────► Doctor
Patient ◄─── webrtc:answer ──── NestJS Gateway ◄─── webrtc:answer ──── Doctor
Patient ──── ice-candidate ──►  NestJS Gateway ──── ice-candidate ──►  Doctor

After ICE → P2P established → NestJS exits media path entirely
```

### Prescription and report files
1. A patient uploads a JPEG/PNG/WebP/PDF (max 5 MB; type is checked from file content, not the client's claim).
2. Prescription files are **AES-256-GCM encrypted at rest** under `PRESCRIPTION_STORAGE_DIR` (needs `ENCRYPTION_KEY`), named by random key; nothing serves that directory.
3. Only the owner or pharmacist/admin accounts can download (`GET /v1/prescription-uploads/:id/file`); everyone else gets 404.
4. Medical **reports** are stored as private local files but are **not encrypted** (known gap). Local disk storage is for development; production needs encrypted object storage.

### RBAC
- JWT payload contains the role, but the role is **re-read from the database on every request**
- `RolesGuard` checks `@Roles()` decorator on every controller method
- Service layer enforces **resource ownership** (horizontal privilege check)

---

## Redis — 4 Jobs

| Job | Key Pattern | TTL |
|-----|------------|-----|
| OTP storage | `otp:{phone}` | 5 min |
| Rate limiting | `rate:otp:{phone}` | 10 min |
| Video room state | `room:{appointmentId}` | Call duration |
| Refresh token blacklist | `blacklist:{token}` | Remaining token validity |

---

## Getting Started

### Prerequisites
- Docker + Docker Compose
- Node.js 20+

### 1. Clone & configure

```bash
git clone https://github.com/abhishek-0409/Med4u-backend.git
cd Med4u-backend
cp .env.example .env
# Fill in your values in .env
```

### 2. Start with Docker

```bash
docker compose up --build
```

This starts:
- PostgreSQL 15 on port `5432`
- Redis 7 on port `6379`
- NestJS API on port `3000`

### 3. Run without Docker

```bash
npm install

# Make sure PostgreSQL and Redis are running locally, then:
npm run migration:run
npm run seed          # idempotent DEMO data (fictional doctors, medicines, lab tests). Dev only.
npm run start:dev
```

---

## Environment Variables

```env
# App
NODE_ENV=development
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=med4u_user
DB_PASSWORD=CHANGE_ME_generate_a_random_value
DB_NAME=med4u_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=CHANGE_ME_generate_a_random_value
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=CHANGE_ME_generate_a_random_value
JWT_REFRESH_EXPIRES_IN=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Twilio SMS
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

See [`.env.example`](.env.example) for the full list.

---

## API Documentation

Swagger UI is available at:

```
http://localhost:3000/api/docs
```

Auto-generated from NestJS controller decorators. Includes all endpoints, request/response schemas, and JWT auth.

---

## Scripts

```bash
npm run start:dev          # development with hot reload
npm run build              # compile TypeScript to dist/
npm run start:prod         # run the compiled build

npm run migration:show     # list applied / pending migrations
npm run migration:run      # apply pending migrations (never resets data)
npm run migration:revert   # roll back the last migration

npm run seed               # idempotent DEMO seed (refuses to run in production)
npm run user:grant-role -- +91XXXXXXXXXX pharmacist   # promote an existing user

npm run typecheck          # tsc --noEmit
npm run lint:check         # ESLint, read-only (formatting issues are warnings)
npm run lint               # ESLint with --fix (modifies files)
npm test                   # unit tests (+ DB integration tests when TEST_DB_NAME is set)
npm run test:db            # only the PostgreSQL pharmacy integration suite
```

---

## Migrations

Migrations live in `src/database/migrations` and are additive. Before applying them to a database that holds data:

1. Back it up: `pg_dump -Fc -d <db> -f backup.dump`, and check it restores into a scratch database.
2. `npm run migration:show` to see what is pending.
3. `npm run migration:run`, then check the new tables/columns exist.

Current chain: `1714600000000` … `1714600007000` (pharmacy fulfilment is `…6000`, labs and medical reports `…7000`).
After the lab migration, run `npm run seed` once so the demo lab catalog is flagged (lab tests are only offered when `is_demo` is true).

---

## Testing

```bash
npm test                                            # unit tests only
TEST_DB_NAME=med4u_test npm test                    # + PostgreSQL integration tests (bash)
```
PowerShell: `$env:TEST_DB_NAME='med4u_test'; npm test`.
The database name **must end in `_test`** because the suite drops and rebuilds its `public` schema.
Create it first (`CREATE DATABASE med4u_test;`). Connection settings come from `.env`.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests against a PostgreSQL service container, the
production build and `npm audit --omit=dev --audit-level=high`. It does not deploy.

---

## Status and limitations

| Area | State |
|---|---|
| Auth (OTP, JWT, refresh rotation) | Implemented. **Real SMS delivery untested** (needs Twilio credentials). |
| Doctors, appointments | Implemented (demo doctors). No reschedule endpoint. |
| Pharmacy orders, prescription review, order lifecycle | Implemented and tested against PostgreSQL. No payments (orders are unpaid). |
| Labs | Demo catalog and booking requests only; no lab-side workflow or results. |
| Medical reports | Patient upload/download only; unencrypted at rest. |
| Video consultations | Signaling and room authorization implemented; **never tested between two real devices; no TURN configured**. |
| Doctor-issued prescriptions, notifications | Not implemented. |

How to verify the unverified parts: [docs/VERIFICATION.md](docs/VERIFICATION.md).

---

## Project Structure

```
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── decorators/        # @CurrentUser, @Roles, @Public
│   ├── filters/           # HttpExceptionFilter
│   ├── guards/            # JwtAuthGuard, RolesGuard
│   ├── interceptors/      # ResponseInterceptor, LoggingInterceptor
│   ├── pipes/             # ZodValidationPipe
│   └── utils/             # hash, logger, pagination, response
├── config/                # database, redis, jwt, cloudinary, env validation
├── database/
│   ├── entities/          # 13 TypeORM entities
│   ├── migrations/        # versioned schema migrations
│   └── seeds/             # seed scripts
├── modules/
│   ├── auth/              # OTP, JWT, token rotation
│   ├── users/             # patient profile, medical history
│   ├── doctors/           # registration, slots, availability
│   ├── appointments/      # booking state machine
│   ├── consultations/     # WebRTC room + signaling
│   ├── prescriptions/     # Upload, review, encrypted storage
│   ├── medicines/         # catalog (35 medicines)
│   ├── labs/              # lab tests (37), home collection
│   └── notifications/     # FCM push notifications
├── redis/                 # Redis module + constants
└── socket/                # Socket.IO gateway + middleware
```

---

## Security

- JWT (HS256, shared secrets from env) access tokens; refresh tokens are stored hashed in `sessions`, rotated on use, and reuse revokes all sessions
- bcrypt for OTP and refresh-token hashing; OTPs expire in 5 minutes with attempt limits and cooldown (Redis)
- Validation on every request body (Zod / class-validator)
- Helmet security headers; per-IP rate limiting with `express-rate-limit` (**in-memory**, so per process)
- Object-level authorization (orders, prescriptions, reports, appointments) enforced in services
- Soft deletes on entities
- Known gaps: reports not encrypted at rest; local-disk file storage; no TURN server configured; OTP verification is not atomic; dev-tooling dependencies still carry advisories (`npm audit`)

---

## Demo seed data (development only)

`npm run seed` loads clearly-labelled **demo** data so the app has something to show. It is safe to run any number of times.

| Data | Count | Notes |
|------|-------|-------|
| Demo doctors | 36 across 11 specialties | Fictional. `is_demo = true`, `is_verified = false`, licence column holds `DEMO-DOC-NNN` (not a registration number), rating/reviews are 0, no login credentials |
| Demo medicines | 100 across 10 categories | One brand + one variant + one `DEMO_ESTIMATE` price each. 20 are prescription-only |
| Lab tests | 38 | Only inserted if a test with that name is missing. Not exposed by any API yet |

**Safety properties**

- Refuses to run when `NODE_ENV=production`. There is no override.
- Insert-or-update by stable keys (`users.phone = demo-doc-NNN`, `doctors.license_number = DEMO-DOC-NNN`, `brands.catalog_key`), so re-runs never duplicate rows.
- Only touches rows it owns (demo-flagged doctors/brands and its own `DEMO_ESTIMATE` prices). It never deletes, truncates, resets, or touches real users, doctors, appointments or orders.
- Never resets stock of an existing product (orders may have consumed it).
- One transaction: all or nothing. Does not create or sync tables: run `npm run migration:run` first.
- Clears the `doctors:*` / `medicine:*` Redis caches afterwards so new rows show immediately.

**Prices are demo estimates.** Every medicine price is an illustrative INR figure stored with price source `DEMO_ESTIMATE` and a `is_demo` brand flag; the API returns `isEstimate: true` and the app says so. They are *not* verified retail prices, and brand/manufacturer attributions are unverified. Replace `src/database/seeds/data/medicines.demo.ts` (or load a verified catalog) before presenting prices as real. When unsure whether a product is prescription-only, it is marked prescription-only, and no narcotic / psychotropic / Schedule X product is included.

Run it:

```bash
npm run migration:run   # schema first
npm run seed            # run as often as you like
```

> **Existing dev databases built with `DB_SYNC=true`** have no `migrations` table, so `migration:run` would try to re-create existing tables. Back up first, then baseline once: create the table and insert the first four migration rows (names/timestamps are in `src/database/migrations`), then run `npm run migration:run`, which applies only the new one. `DB_SYNC` should stay `false`.

---

## Catalog and orders API

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET /api/v1/medicines` | public | `search`, `category`, `requiresPrescription`, `inStock`, `sortBy=name\|price_asc\|price_desc`, `page`, `limit` (max 50). Unknown params and bad values return 400 |
| `GET /api/v1/medicines/categories` | public | Categories with product counts |
| `GET /api/v1/medicines/:id` | public | One purchasable product (the `id` is the variant id) |
| `POST /api/v1/orders` | patient | Body is variant ids + quantities + delivery address only. Prices come from the database; any client price/total field is rejected. 409 `INSUFFICIENT_STOCK` / `MEDICINE_UNAVAILABLE`, 422 `PRESCRIPTION_REQUIRED` / `PRESCRIPTION_INVALID`. Optional `idempotencyKey` makes retries safe |
| `GET /api/v1/orders`, `GET /api/v1/orders/:id` | patient | Own orders only |
| `PATCH /api/v1/orders/:id/cancel` | patient | Cancels and returns stock |

Money is handled as integer paise in the server (`common/utils/money.util.ts`) and stored as `numeric(_,2)`.

**Not production-ready:** no payment gateway, no pharmacy fulfilment, and no prescription-to-medicine matching. A prescription-only order is only accepted with a prescription id that exists on the caller's account, and is then held as `PENDING_REVIEW` for a pharmacist who does not exist yet. The mobile app therefore does not let prescription-only items into the cart.

---

## License

Private — All rights reserved.

## Pharmacy (orders, prescriptions, fulfilment)

- Staff accounts: users sign in once (patients), then `npm run user:grant-role -- +91XXXXXXXXXX pharmacist`.
- Pharmacy API: `/api/v1/pharmacy/orders` (list, get, `PATCH :id/status`) and `/api/v1/pharmacy/prescriptions` (queue, `POST :id/approve|reject`). Roles: `pharmacist`, `admin`.
- Prescription files are AES-256-GCM encrypted under `PRESCRIPTION_STORAGE_DIR` (default `./storage/prescriptions`) using `ENCRYPTION_KEY`; they are only served through `GET /api/v1/prescription-uploads/:id/file` to the owner or staff.
- PostgreSQL integration tests (wipe the schema of a DB whose name ends in `_test`):
  `TEST_DB_NAME=med4u_test npx jest pharmacy.integration`
