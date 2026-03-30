# LiveKit Setup

This app now uses an **Expo Go-compatible** live podcast architecture:

- Firebase/Firestore for room state, reminders, paywall, and notifications
- LiveKit for the actual realtime audio room
- a **persistent hidden `WebView`** as the audio engine
- a **floating blue capsule mini-player** so listeners can keep browsing while audio continues

## Important

The current dissertation/demo path is built for **Expo Go**.

That means:

- users can open the app in Expo Go
- join a live podcast from inside the app
- minimize it to a floating capsule
- continue browsing other screens while listening

What this does **not** promise:

- guaranteed background audio when the app is fully closed or the phone is locked
- native Twitter/Spotify-level background media controls

## 1. Create a LiveKit Cloud project

In the LiveKit dashboard copy:

- `WebSocket URL`
- `API key`
- `API secret`

Example:

```text
wss://your-project.livekit.cloud
```

## 2. Configure Firebase Functions

Set the LiveKit credentials:

```bash
firebase functions:config:set livekit.url="wss://YOUR_PROJECT.livekit.cloud" livekit.api_key="YOUR_API_KEY" livekit.api_secret="YOUR_API_SECRET"
```

If you want live subtitles/captions in podcast rooms, also set the AssemblyAI key:

```bash
firebase functions:config:set assemblyai.api_key="YOUR_ASSEMBLYAI_API_KEY"
```

Then deploy:

```bash
firebase deploy --only functions,firestore:rules
```

## 3. Expo Go setup

For the current WebView-based approach, you can stay on Expo Go.

Run:

```bash
npx expo start
```

Then open the project in Expo Go on iPhone or Android.

## 4. Firestore collections and rules

The podcast feature uses:

- `live_podcast_rooms`
- `live_podcast_invite_codes`
- `live_podcast_speaker_requests`
- `live_podcast_reminders`
- `live_podcast_audit_logs`
- `notifications`

Deploy rules with:

```bash
firebase deploy --only firestore:rules
```

## 5. Current in-app flow

Therapist flow:

1. Open the therapist dashboard
2. Tap `Podcast spaces`
3. Create a room from `/live/create`
4. Open the room details
5. Start the room
6. Minimize it to the blue capsule and keep browsing

Listener flow:

1. Open the home feed
2. Tap the blue live capsule or open `/live`
3. Join the room
4. Minimize it and keep listening while browsing
5. Tap `Raise hand` if speaking is allowed

## 6. Notifications

Current notification behavior:

- users who tap `Remind me` on a scheduled room get:
  - an in-app notification document in `notifications`
  - an Expo push notification when the host starts the room
- tapping the push opens the room screen
- the notification bell can show the new podcast-started item

## 7. What is already implemented

- therapist/admin room creation
- public live/scheduled room discovery
- first-live-free logic for non-premium listeners
- reminder signup
- push notification fanout for reminder subscribers when a room starts
- co-host invite codes
- speaker request queue
- floating blue capsule mini-player
- Expo Go-compatible persistent listening while browsing the app
- live subtitle scaffolding powered by AssemblyAI temporary tokens

## 8. Recommended commands

```bash
firebase deploy --only functions,firestore:rules
npx expo start
```

## 9. Next phase ideas

- host mute/kick controls
- recording + replay publishing pipeline
- transcript summaries + AI summaries
- dedicated admin audit screen
- richer live indicators on more screens