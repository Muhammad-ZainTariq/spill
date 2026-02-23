# Push notifications (banner / notification tray)

You now get **two** kinds of notifications:

1. **In-app** – The "Game invite" / "Match accepted" dialog (Later / Join) when the app is open.
2. **Push** – The system notification at the top / in the notification tray when the app is in the background or closed.

## What’s in place

- **expo-notifications** and **expo-device** – App requests permission and gets an Expo push token, then saves it to Firestore `users/{uid}.expo_push_token` when the user is logged in.
- **Cloud Function `sendExpoPush`** – Callable that looks up the recipient’s `expo_push_token` and sends a push via Expo’s API. It’s called when you send a game invite or when someone accepts your match request.
- **Tap handling** – If the user taps the push, the app opens to the right screen (game or Matches).

## What you need to do

1. **Install dependencies** (if not already done):
   ```bash
   npm install expo-notifications expo-device
   ```

2. **Deploy the Cloud Function**:
   ```bash
   firebase deploy --only functions
   ```
   This deploys the new `sendExpoPush` function.

3. **Physical device** – Push notifications don’t work in the simulator/emulator. Use a real device.

4. **EAS project (optional)** – For a stable Expo push token, configure your EAS project ID in `app.json`:
   ```json
   "extra": {
     "eas": { "projectId": "your-eas-project-id" },
     ...
   }
   ```
   Find the project ID in [expo.dev](https://expo.dev) → your project → Overview. If you don’t set it, the token may still work in development builds.

5. **Development build** – In Expo Go, push can be limited. For full behavior use a dev client: `npx expo run:ios` or `npx expo run:android`.

After this, when someone invites you to a game or accepts your match, you’ll get both the in-app dialog and the system notification (if the app allowed notification permission).
