# Med4U Integrated Digital Healthcare Platform

This monorepo contains the Med4U patient app, doctor app, and NestJS backend.

## Projects

- `Med4u-patient/` ? patient mobile application
- `Med4u-doctor/` ? doctor mobile application
- `Med4u-backend/` ? NestJS API and database migrations

## Local setup

Install dependencies in the project you want to run, then copy that project?s `.env.example` to a local `.env` and fill in values from your own development environment. Keep `.env` files and credentials out of Git. Mobile `EXPO_PUBLIC_*` values are bundled into the app and must contain public configuration only.

The backend validates its required environment variables at startup and rejects template placeholders. Keep database, payment, mail, SMS, encryption, and signing secrets on the backend.

Each project README documents its own commands. The apps and backend include typecheck and test scripts in their `package.json` files.
