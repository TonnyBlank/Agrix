# AgriLink X Mobile

Native mobile app built with Expo, React Native, and TypeScript.

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

- Opens with a native-style login screen.
- After sign-in, enters a bottom-tab mobile app.
- Includes Home, Market, Loans, Chats, and Profile screens.

The login is currently a UI flow only. The next step is connecting it to Supabase auth and the existing backend API.
