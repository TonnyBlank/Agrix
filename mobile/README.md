# AgriLink X Mobile

Native mobile app built with Expo, React Native, and TypeScript.

## Environment

Create `mobile/.env` from `.env.example`. The mobile app uses the same Supabase project and backend API as the web app:

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001/api
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

When using a connected Android device or emulator, expose the backend port:

```bash
adb reverse tcp:3001 tcp:3001
```

## Run on Android

1. Open Android Studio.
2. Start an emulator from Device Manager and wait until the Android home screen is visible.
3. In a terminal, run:

```bash
cd /home/tonnyblank/Downloads/Agrilink-X-main/mobile
npm run android
```

If Expo says port 8081 is already in use, accept the next port or stop the old Expo terminal.

## Current App Flow

- Opens with a native-style sign-in/create-account screen that follows the web auth flow.
- Uses Supabase auth for real sign-in and sign-up.
- Shows a mobile dashboard summary for listings/products, pending orders, messages, and notifications.
- Uses role-based mobile navigation that matches the web dashboard features.
- Feature screens call the same backend endpoints as the web dashboard where a mobile implementation exists.
- The goal is feature consistency with the web platform, presented as mobile screens instead of a web sidebar.
