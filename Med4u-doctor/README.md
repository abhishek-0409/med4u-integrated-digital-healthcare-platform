# Med4U Doctor

Independent Expo and React Native app foundation for the Med4U doctor experience.

## Run locally

```sh
npm install
npm start
```

Use **Open dashboard preview** on the login screen to explore the UI. Login is a local preview only. Appointments, profile information, availability, and history are clearly labelled sample data; no doctor API or call service is configured.

## Checks

```sh
npm run typecheck
npm test
npx expo export --platform android
```

## Modules

- `src/auth`: preview auth provider boundary.
- `src/api`: unconfigured API client boundary.
- `src/state`: appointment selectors over labelled sample data.
- `src/navigation`: doctor app stack navigation.
- `src/theme`: Med4U light-theme tokens maintained locally in this app.

The video consultation screen is a non-connected shell and cannot start a call.
