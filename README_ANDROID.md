# Tallinn GO - Android Build Instructions

This project is configured with **Capacitor** to allow building a native Android APK using Android Studio.

## Prerequisites

- **Node.js** and **npm** installed.
- **Android Studio** installed.
- **Android SDK** and **Gradle** configured.

## Build Workflow

1. **Build the Web App**:
   Run the build command to generate the `dist` folder:
   ```bash
   npm run build
   ```

2. **Sync with Android**:
   Copy the web assets to the Android project:
   ```bash
   npx cap sync
   ```

3. **Open in Android Studio**:
   Open the `android` directory in Android Studio:
   ```bash
   npx cap open android
   ```
   *Alternatively, open Android Studio and select the `android` folder in this project.*

4. **Build the APK**:
   In Android Studio:
   - Go to **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
   - Once the build is complete, you can find the APK in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Native Features

The app is configured with the following native features:

- **Geolocation**: Uses `@capacitor/geolocation` for accurate and reliable location tracking on Android.
- **Back Button**: Handles the Android back button to navigate back or exit the app.
- **Status Bar**: Configured with a white background and dark text for a clean look.
- **Splash Screen**: A basic splash screen is configured to show while the app loads.

## Configuration

- **App ID**: `com.tallinngo.app`
- **App Name**: `Tallinn GO`
- **Permissions**: Geolocation permissions are already added to `AndroidManifest.xml`.

## Troubleshooting

- If you make changes to the web code, remember to run `npm run build` and `npx cap sync` before building in Android Studio.
- Ensure your Android Studio is up to date and has the necessary SDK platforms installed.
- If geolocation is not working, check the app's permissions in Android settings.
