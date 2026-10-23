# Med4U (mobile app)

Expo / React Native client for Med4U, a healthcare app: doctor appointments, a pharmacy with prescription
review, lab-test requests, medical-report storage and video consultations. It talks to the NestJS backend
in the sibling repository `Med4u-backend`.

> **Maturity: student/portfolio project, not production-ready.** It is an integrated full-stack app with
> real backend rules and tests, but it has **not** been verified on a physical device,
> it has no payment provider, and its doctors, medicines and lab tests are **demo data**. See
> [What works and what doesn't](#what-works-and-what-doesnt).

## What works and what doesn't

Status words: **Implemented** (code + automated tests), **Implemented, unverified on device** (code exists
and typechecks/bundles, but has never been exercised by an automated UI/E2E test or confirmed on hardware),
**Demo** (works against seeded fictional data), **Not implemented**.

| Area | Status | Notes |
|---|---|---|
| Phone OTP login, token refresh, logout | Implemented, unverified on device | Backend logic is unit/integration reasoned; **real SMS delivery has not been tested** (needs Twilio). Tokens in `expo-secure-store` on native, memory-only on web. |
| Doctor list/detail | Demo | 51 fictional doctors, all flagged demo, none "verified"; no ratings. |
| Appointments (book, list, cancel) | Implemented, unverified on device | Server prevents double booking. **No reschedule.** |
| Medicine catalog, search, filters | Demo | 135 seeded products; prices are labelled estimates. |
| Cart, checkout, orders | Implemented | Server re-prices and checks stock in a transaction; cart is saved per user on the device. Covered by frontend unit/component tests and backend PostgreSQL tests. **No payments**: every order is "Unpaid". |
| Prescription upload + pharmacist review | Implemented, unverified on device | Backend tested against PostgreSQL. Pharmacist console (`src/screens/pharmacy`) is typechecked only. Review is not an authenticity check. PDFs can't be previewed in the native app. |
| Lab tests | Demo | Demo catalog and booking requests only; no lab side, no results. |
| Medical reports | Implemented, unverified on device | Patient upload/download only; no clinician access. |
| Video consultation | Native only, unverified | `react-native-webrtc` + Socket.IO signaling. **Never tested between two real devices.** Browser build shows a guidance screen, not a call. **No TURN server is configured**, so calls across restrictive networks may fail. |
| Push notifications | Not implemented | |
| Offline mode | Not implemented | Network failures show an error/retry state; there is no offline-first sync. |
| Doctor-issued prescriptions, reschedule, payments | Not implemented | |

## Requirements

- Node.js 20.19+ (CI uses 22)
- A running Med4U backend (see its README)
- For native builds: Android Studio (and Xcode on macOS). Expo Go is **not** enough for video calls.

## Setup

```bash
npm ci                                  # install exactly what package-lock.json says
cp .env.example .env.development        # then edit EXPO_PUBLIC_API_URL
npm start                               # Expo dev server (use a dev client for video)
```

### Environment variables

| Variable | Used for |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL including `/api`, e.g. `http://10.0.2.2:3000/api` (Android emulator), `http://localhost:3000/api` (iOS simulator / web). **Must be `https://` in production builds.** Inlined at build time: never put secrets in `EXPO_PUBLIC_*` variables. |

`.env.development` is used by `expo start`; production builds and exports need the variable in
`.env.production` or the build environment.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run android` / `npm run ios` | Native build + run (`expo run:*`) |
| `npm run start:dev-client` | Dev server for a custom dev client |
| `npm run typecheck` | `tsc --noEmit` (generated `dist/` is excluded) |
| `npm test` / `npm run test:ci` | Jest (`jest-expo`) unit and component tests |
| `npx expo export --platform android --output-dir /tmp/x` | Production bundle check (Hermes) |
| `npx expo export --platform web --output-dir /tmp/x` | Web bundle check |

## Tests

`npm test` runs 41 tests: price/sum maths, delivery validation, the cart store (quantities, stock caps,
price-change flags, persistence/restore, prescription items), and the Checkout screen (success, failure,
stale price, out-of-stock, duplicate taps, prescription gate). They mock the network; they do **not**
replace testing on a device. There are no end-to-end tests yet.

## Project layout

```
src/
  components/    ui/ (design system), medicine/, order/, prescription/, pharmacy/, doctor/, video/
  hooks/         async data, pagination, debounced values, quote, cart restore
  navigation/    Auth and Main stacks (staff accounts land on the pharmacy console)
  screens/       auth, home, doctor, appointments, medicine, prescription, pharmacy, lab, profile
  services/      one typed service per backend area + api/client.ts (axios, refresh-on-401)
  store/         Zustand: authStore, userStore (cart)
  theme/         colour, spacing, typography tokens
  types/ utils/ test/
```

## Design system and data notes

- **Tokens** live in `src/theme`; shared components in `src/components/ui` (`Button`, `Input`, `StatusBadge`,
  `InfoBanner`, `QuantityStepper`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `ConfirmationDialog`, …).
- **Honesty rules**: ratings render only for real reviews; "Verified" only for genuinely verified doctors
  (demo doctors show a "Demo profile" badge); demo medicine prices are labelled as estimates; orders are
  labelled unpaid.
- **Data** comes from the backend through typed services. The cart is client state saved per user on the
  device; the server re-prices every order and validates stock and prescription rules.
- **Web**: Expo SDK 54 uses Metro for web; `babel.config.js` enables the `import.meta` transform for web only.
  The web bundle builds, but the web UI has **not been rendered/tested in a browser by the maintainers**.

## Native video consultations

Uses `react-native-webrtc` 124 with Socket.IO signaling (`src/components/video/VideoCall.native.tsx`).
The backend issues a short-lived room token plus ICE servers (`POST /v1/consultations/join`).

```bash
npx expo prebuild
npx expo run:android          # or: npx expo run:ios on macOS
npm run start:dev-client
```

Production needs a TURN relay; see `Med4u-backend/docs/VERIFICATION.md` for the verification procedure.
**Do not describe video calls as working until that procedure has been completed on two real devices.**

## Continuous integration

`.github/workflows/ci.yml` runs on every push/PR: `npm ci`, typecheck, tests, Android and web bundle
checks, and `npm audit --audit-level=critical`. It does not build an APK/IPA and does not deploy.

## Known security notes

- Dependency audit: 0 critical. The remaining *high* findings are in the Expo/Metro **build tooling**
  (not shipped in the app bundle); clearing them needs an Expo SDK upgrade, tracked separately.
- Cart persistence stores only product ids, quantities and last-seen prices.
