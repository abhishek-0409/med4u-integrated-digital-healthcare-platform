# Doctor registration and verification

A person who is not yet a doctor signs in with a normal OTP login (this creates a **patient**), submits an
application, and waits for a human reviewer. **Nothing is approved by time or by code**: only an `admin` reviewer's
`approve` call creates the verified doctor profile and promotes the account, in one transaction.

## Life cycle

`PENDING_VERIFICATION` -> `UNDER_REVIEW` -> `APPROVED` | `REJECTED` | `NEEDS_INFO`; `NEEDS_INFO` (or an allowed
`REJECTED`) -> `PENDING_VERIFICATION` on resubmission. `review_deadline_at = submitted_at + 24 h` (database CHECK). It is a
review *target*: an application past it is flagged `reviewOverdue`, never decided.

## API (all under `/api`)

Applicant (JWT; ownership comes only from the token):

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/doctor-applications` | multipart: fields + `graduationCertificate` + `registrationCertificate` (PDF/JPEG/PNG, 5 MB each). Role `patient` only. 201 |
| GET | `/v1/doctor-applications/me` | own application, status, deadline, documents metadata, reviewer message (never internal notes). 404 `APPLICATION_NOT_FOUND` if none |
| POST | `/v1/doctor-applications/me/resubmit` | multipart, any subset of fields and/or replacement documents. Only from `NEEDS_INFO` or an allowed `REJECTED` |
| GET | `/v1/doctor-applications/me/documents/:documentId` | own document; `attachment`, `no-store`, `nosniff` |

Reviewer (`admin` role only; a reviewer can never act on their own application):

| Method | Path | Body |
|---|---|---|
| GET | `/v1/admin/doctor-applications?status=&page=&limit=` | default: pending + under review, earliest deadline first |
| GET | `/v1/admin/doctor-applications/:id` | details, documents metadata, full audit trail |
| GET | `/v1/admin/doctor-applications/:id/documents/:documentId` | recorded as `DOCUMENT_VIEWED` |
| POST | `.../:id/start-review` | - |
| POST | `.../:id/request-info` | `{ message, notes? }` |
| POST | `.../:id/reject` | `{ reason, allowResubmission?, notes? }` |
| POST | `.../:id/approve` | `{ registryCheck, registrySource?, registryReference?, registryUnavailableReason?, notes }` |

`approve` requires the reviewer to state how the registration was checked: either
`VERIFIED_AGAINST_OFFICIAL_REGISTER` (+ `registrySource`, `registryReference`) or `REGISTER_UNAVAILABLE` (+ a reason). The
system does not call any registry itself and never treats an upload as proof of authenticity.

Making a reviewer: the reviewer signs in once, then `npm run user:grant-role -- <phone> admin`.

## Data and storage

Tables `doctor_applications`, `doctor_application_documents`, `doctor_application_events` (migration
`1714600013000-DoctorApplications`, additive). The events table rejects UPDATE/DELETE (trigger). Pending applications
have **no** `doctors` row, so they cannot be listed, booked, paid, prescribed to or consulted.

Files are AES-256-GCM encrypted in `storage/doctor-documents/` (outside any static path), addressed by a random key,
using `DOCUMENT_ENCRYPTION_KEY` (separate from `ENCRYPTION_KEY`; uploads return 503 without it). Type is decided from file
content, never the client's Content-Type; extension must match; executables and double extensions are refused; stored
names are random and display names sanitised.

Retention: replaced documents are deleted at resubmission; files of rejected applications (no resubmission allowed) are
deleted 90 days after the decision with `npm run applications:purge` (dry run by default, `-- --apply` to delete). Rows
and the audit trail are kept. Approved applicants' documents are kept for the life of the doctor account.

## Not configured / limitations

- No notification service exists in this codebase: applicants see status changes by opening the app (the API reports
  `notifications: "not_configured"`).
- Email addresses are collected as contact information; there is no email verification (`emailVerified` is always false).
- Approval is refused (409) if the applicant's account already has patient appointments, because a role change would
  orphan them; a human must resolve that first.
- There is no reviewer UI; use the API (Swagger at `/api/docs`).

## Demo doctor (development only)

`1111111112` (normalised to `+911111111112`) may sign in with the fixed code `DEMO_DOCTOR_OTP`, **only** when
`NODE_ENV=development`, `DEMO_DOCTOR_LOGIN_ENABLED=true`, no hosting-platform variable is set and `DB_SSL` is not true.
The app refuses to start if the flag is set otherwise; in production the number is refused outright; a demo account in a
production database stops the boot. Other numbers always use the real OTP flow. The account is created only by
`npm run demo:doctor -- --confirm-db <DB_NAME> --apply` and is an unverified, unlisted profile (no bookings, payments,
prescriptions or consultations), plus, only with `--with-patient-stub`, an inactive synthetic patient stub. The Doctor App shows a DEMO banner.
