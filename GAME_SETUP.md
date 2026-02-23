# In-app games (Play with match)

Matched users can tap **Play** in the match screen to open a shared Tic-Tac-Toe game in a WebView. Both users join the same room using the match ID.

## What’s in the project

- **`game-ttt/`** – Ready-to-deploy Tic-Tac-Toe (Node + Socket.IO + one HTML page). Uses `?room=` so the app can pass the match ID. Dependencies are already installed in `game-ttt/`.
- **Matches screen** – “Play” button in the match header.
- **`app/game-webview.tsx`** – Opens the game URL with `?room=<matchId>`.
- **`app.json` → `expo.extra.gameBaseUrl`** – Set this to your deployed game URL (see below).

## Quick setup (full steps in GAME_DEPLOY_STEPS.md)

1. **Install app deps:** In the Spill folder run `npm install`.
2. **Deploy the game:** Push `game-ttt` to GitHub, then on [Render](https://render.com) create a **Web Service** from that repo (Root Directory: `game-ttt`, Build: `npm install`, Start: `npm start`). Copy the live URL.
3. **Set URL in app:** In `app.json` set `"gameBaseUrl": "https://your-app.onrender.com"` (your Render URL, no trailing slash).
4. **Test:** Start a match, tap Play on both devices; you should get the same game.

See **GAME_DEPLOY_STEPS.md** for the exact step-by-step (including Render screens and troubleshooting).
