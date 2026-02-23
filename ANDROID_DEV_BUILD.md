# Android development build

Your project is set up for Android development builds with **EAS Build** and **expo-dev-client**.

## Create the development APK

From the project root:

```bash
npm run build:android:dev
```

Or directly:

```bash
npx eas build --profile development --platform android
```

- **First time:** You’ll be prompted to log in to your Expo account and confirm project/linked repo. The build runs in the cloud; no local Android SDK required.
- **Output:** You get an **APK** (no Play Store). EAS shows a download link when the build finishes.
- **Install:** Copy the APK to your device and install it, or use the “Install” option in the EAS build page if available.

## After installing the dev build

1. Start the dev server: `npm start` (or `expo start --dev-client`).
2. Open the **bttrtogether** app on your device; it will connect to the dev server and load your JS bundle.

## Build profiles (eas.json)

| Profile      | Use case              | Command / script                |
|-------------|------------------------|---------------------------------|
| development | Dev client + APK       | `npm run build:android:dev`     |
| preview     | Internal testing APK   | `npm run build:android:preview` |
| production  | Release APK           | `npm run build:android:production` |

Development profile uses `developmentClient: true` and `buildType: "apk"`, so you get a single APK suitable for sideloading on devices or emulators.
