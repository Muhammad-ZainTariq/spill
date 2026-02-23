# In-app games (Play with match)

Matched users can tap **Play** in the match screen to choose a ready-made game (Square Off!, Breakout, Space Shooter). The game opens in a WebView with `?room=<matchId>` so both users join the same room.

## What’s in the project

- **`game-ttt/`** – Minimal static server (placeholder). Deploy **ready-made games** (Square Off, Breakout, Space-Shooter) at `/squareoff`, `/breakout`, `/spaceshooter` with `?room=` support. Set `gameBaseUrl` in app.json to your games URL.
- **Matches screen** – “Play” button in the match header.
- **`app/game-webview.tsx`** – Opens the game URL with `?room=<matchId>`.
- **`app.json` → `expo.extra.gameBaseUrl`** – Set this to your deployed game URL (see below).

## Quick setup (full steps in GAME_DEPLOY_STEPS.md)

1. **Install app deps:** In the Spill folder run `npm install`.
2. **Deploy the game:** Push `game-ttt` to GitHub, then on [Render](https://render.com) create a **Web Service** from that repo (Root Directory: `game-ttt`, Build: `npm install`, Start: `npm start`). Copy the live URL.
3. **Set URL in app:** In `app.json` set `"gameBaseUrl": "https://your-app.onrender.com"` (your Render URL, no trailing slash).
4. **Test:** Start a match, tap Play on both devices; you should get the same game.

See **GAME_DEPLOY_STEPS.md** for the exact step-by-step (including Render screens and troubleshooting).
