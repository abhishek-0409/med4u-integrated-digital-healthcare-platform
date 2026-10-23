# Prescription PDF and push setup

The patient app targets Expo SDK 54. PDF rendering and sharing use `expo-print`, `expo-sharing`, and `expo-file-system`; push registration uses `expo-notifications`, `expo-device`, and `expo-secure-store`. Install or upgrade these through `npx expo install` so Expo selects SDK 54 compatible versions.

After changing native dependencies or notification permissions, rebuild the development client:

```sh
npx expo prebuild
npx expo run:android
# or: npx expo run:ios
```

Push tokens require an EAS project ID. Set `EXPO_PUBLIC_EAS_PROJECT_ID` for the app build, or configure `extra.eas.projectId` in Expo app config. Configure Android FCM v1 credentials and iOS APNs credentials for the EAS project before expecting device delivery. The app registers only after patient authentication and granted permission. Expo provider tickets are not treated as device delivery receipts; in-app notifications remain the fallback.

Apply the backend migration `1714600015000-DevicePushTokens` after taking and verifying the normal local database backup. The migration adds device-token and Expo receipt-ticket tables. Do not use `synchronize` for this change.
