# Real doctors in the Med4U directory

Demo doctors (`is_demo = true`) are unchanged. Real doctors are added only from sourced files and are shown
publicly only after a registration check has been recorded.

## Workflow

1. Prepare a JSON file (template: `docs/doctor-import.example.json`). Every record must name its `source`
   (name, retrieval date, and the `permission` under which the data may be used). Unknown fields are left out,
   never guessed.
2. `npm run doctors:import -- file.json` is a dry run (validates, reports, rolls back).
   `npm run doctors:import -- file.json --apply` writes. One error aborts the whole file.
3. Imported doctors are `unverified` and invisible to patients (list, detail and booking return 404 for them).
4. After someone checks the doctor on the NMC Indian Medical Register (or the state council register):
   `npm run doctors:verify -- --council "<council>" --number "<no>" --registered-name "<name on register>" --method NMC_PORTAL_MANUAL --reference "<date + ticket/screenshot id>" --by "<your name>"`
   The tool refuses when the register name does not match the profile, the method or reference is missing, or the
   doctor is a demo profile. `--revoke [--reject]` withdraws verification.

## Guarantees

- Idempotent: key is (council, registration number), case- and space-insensitive; re-running reports `unchanged`.
- Demo doctors are never read-modified; a collision is an error. Doctor ids and appointments are preserved.
- Import cannot set verification (strict schema); the database rejects `verified` without evidence, a verified demo
  profile, and a second doctor with the same registration.
- A name change on a verified profile resets verification.
- Missing fee/experience stay `null` ("Not provided"); a null fee blocks booking (never a free consultation).
- Experience is computed from `careerStartYear` when known; a stated value is shown only with its source.

## Data sources evaluated (October 2026)

| Source | Result |
|---|---|
| NMC Indian Medical Register (nmc.org.in) | Public web search by name, year, registration number, council. The page documents no API, bulk download or reuse licence; Terms of Use were not readable. Not integrated; no scraping. Used as the manual verification reference. |
| ABDM Healthcare Professionals Registry (HPR) | Has search/get-profile APIs, but needs an ABDM sandbox application, client id/secret and the `hid` gateway role, then certification for production. No credentials here, so not integrated. `HPR_API` is reserved as a verification method. |
| Commercial NMC verification APIs (e.g. Decentro, Surepass) | Advertise name, registration number, qualification, registration date and status lookups. Need a commercial agreement and credentials; pricing and storage terms not confirmed (vendor page returned 404 when fetched). Not integrated. |
| Third-party scrapers of the NMC register (e.g. Apify actors) | Rejected: scraping a register whose terms are unverified. |
| Google Places API | Gives clinic/hospital location data only, no credentials or qualifications. Terms allow storing only `place_id` (coordinates for 30 days); names, addresses and photos must not be cached and need Google attribution. Not integrated. |
| Doctor-directory sites (Practo etc.) | No public API found; scraping not permitted. |

Nothing in the repository contains real doctor data.
