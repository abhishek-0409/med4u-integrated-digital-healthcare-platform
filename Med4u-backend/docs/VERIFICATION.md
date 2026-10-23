# Verification plan for what automated tests cannot prove

Automated checks (typecheck, unit tests, PostgreSQL integration tests, bundle builds) are in CI. The items
below need real infrastructure or hardware. **Nothing here has been completed yet**: record results in the
table at the bottom only after you have actually done each step.

## Why these are blocked today

| Item | Blocker |
|---|---|
| Real SMS OTP | Needs a Twilio account (SID/token/number); a trial account only texts verified numbers. |
| Android emulator/device | Needs Android Studio / a USB-debuggable phone on the same network as the API. |
| Android build (APK/AAB) | Needs Android SDK + JDK 17 (`npx expo prebuild` then `npx expo run:android`). A JS bundle check already runs in CI; a native build does not. |
| Browser rendering | Needs a person (or a browser-automation setup) to open the web build. |
| WebRTC between two clients | Needs two devices/emulators with camera+mic, two accounts, and an appointment between them inside the join window. |
| TURN relay | Needs a publicly reachable host with UDP/TCP 3478 (+ relay port range) and ideally TLS on 5349. Not available in this repository. |

## 1. Real SMS OTP login

1. Set `TWILIO_ACCOUNT_SID` (starts with `AC`), `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` in `.env`; use a verified number on a trial account.
2. Start the API with `NODE_ENV=production` semantics in mind: without Twilio configured it **refuses** to send (it only logs OTPs in development).
3. In the app: enter the number → expect an SMS within ~30 s → enter the code.
4. Also check: wrong code ×3 locks the OTP; a 4th request inside 60 s is refused (cooldown); more than 3 requests in 10 min is refused; the same code cannot be reused.
5. Confirm no OTP appears in server logs.

## 2. Android emulator or device

1. `npm ci`; set `EXPO_PUBLIC_API_URL` (`http://10.0.2.2:3000/api` for the emulator; your LAN IP for a phone).
2. `npx expo prebuild` then `npx expo run:android`.
3. Walk through: login → browse doctors → book/cancel appointment → pharmacy (search, add to cart, restart the app and confirm the cart is restored, checkout) → upload a prescription → profile/logout.
4. Check small screens (≈320 dp wide) and large system fonts; check TalkBack reads buttons and form errors.

## 3. Browser rendering

1. `npx expo export --platform web --output-dir dist-web` and serve it (`npx serve dist-web`), with the API allowing that origin (`FRONTEND_URL`).
2. Check login, catalog, cart, checkout. Video is **expected** to show the "use the mobile app" screen on web.

## 4. Android build

`npx expo prebuild && cd android && ./gradlew assembleDebug` (release builds need your own signing key; never commit it).

## 5. WebRTC call between two authorized clients

1. Create two accounts. Make one a doctor with an appointment with the patient (the demo doctors cannot log in).
2. Book a video appointment and wait until it is inside the join window (`canJoinConsultation` in `appointment-time.util.ts`).
3. Both join from two physical devices (or one emulator + one phone). Expect: both see/hear each other; mute/camera toggles work; ending the call updates the room; killing the app on one side shows "reconnecting"/"ended" on the other.
4. Negative checks: a third user's token is refused; a patient token for another appointment's room is refused; joining twice with the same user is refused.

## 6. TURN relay across different networks

The backend already mints **short-lived coturn-style credentials** per join (`buildTurnServers` in
`consultation.service.ts`): username `"<expiry-unix>:<random>"`, credential = base64 HMAC-SHA1 of the username
with `TURN_SHARED_SECRET`. No credentials are hardcoded or logged. To enable it:

1. Run coturn on a public host. Example `turnserver.conf` (placeholders only):
   ```
   listening-port=3478
   tls-listening-port=5349
   realm=turn.example.com
   use-auth-secret
   static-auth-secret=<the same value as TURN_SHARED_SECRET>
   fingerprint
   no-multicast-peers
   no-cli
   min-port=49152
   max-port=49999
   # tls: cert=/path/fullchain.pem  pkey=/path/privkey.pem
   ```
   Open UDP+TCP 3478, 5349 and the relay port range. Generate the secret with `openssl rand -base64 48` and store it in a secret manager, not in git.
2. Backend `.env`: `TURN_SERVER_URL=turn:turn.example.com:3478` (use `turns:…:5349` when TLS is set up), `TURN_SHARED_SECRET=<secret>`, `TURN_CREDENTIAL_TTL_SECONDS=3600`.
3. Test credentials first with a Trickle-ICE page: request `/v1/consultations/join`, paste one `turnServers` entry, and confirm a candidate of type `relay` appears.
4. Test on different networks: one phone on mobile data, the other on Wi-Fi (and ideally a restrictive corporate/guest Wi-Fi). To prove the relay is used, temporarily set `iceTransportPolicy: 'relay'` in a local build of `VideoCall.native.tsx`, confirm the call works, then revert.
5. Watch coturn logs for allocations. Rotate `TURN_SHARED_SECRET` if it is ever exposed.

## Results log (fill in honestly)

| Check | Date | Tester | Device / network | Result |
|---|---|---|---|---|
| Real SMS OTP | not done | | | |
| Android emulator walkthrough | not done | | | |
| Physical Android walkthrough | not done | | | |
| Browser rendering | not done | | | |
| Android native build | not done | | | |
| Two-device WebRTC call | not done | | | |
| TURN relay (different networks) | not done | | | |
