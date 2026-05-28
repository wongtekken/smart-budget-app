# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Android APK testing

This project uses Expo EAS Build for Android test builds.

### First-time setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Log in to Expo.

   ```bash
   npm run eas:login
   ```

3. Link this app to an Expo/EAS project.

   ```bash
   npm run eas:init
   ```

4. Enable EAS Update for over-the-air updates.

   ```bash
   npm run eas:update:configure
   ```

### Build an APK for testers

```bash
npm run build:android:apk
```

When the build finishes, Expo will show a download link. Send that link to testers so they can download and install the APK on Android.

### Push frequent small updates

Use this when you only changed JavaScript, screens, styles, copy, images, or business logic:

```bash
npm run update:preview -- --message "Describe the change"
```

Testers keep the same installed APK and receive the update through EAS Update.

Build a new APK instead when you change native dependencies, permissions, app icon/splash, Expo SDK, React Native, or Android config.

### Production Android build

Use this later for a Google Play-ready Android App Bundle:

```bash
npm run build:android:production
```

## Expo development

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
