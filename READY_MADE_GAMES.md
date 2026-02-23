# Ready-made games only

The app uses **only ready-made games**. No custom-coded games (no TTT, Chess, Ludo, or Connect Four built in-house).

## Games in the app

- **Square Off!** – ScriptaGames/SquareOff  
- **Breakout** – Couchfriends/breakout  
- **Space Shooter** – Couchfriends/Space-Shooter  

Each opens in the WebView with `?room=<matchId>&opponent=...` so both players join the same room. You must deploy these games yourself and make them room-aware (see below).

## How to use them

1. **Deploy each ready-made game**  
   Clone their repo, build/run their frontend (and backend if they have one). Deploy so you have a base URL (e.g. `https://your-games.example.com`).

2. **Make games room-aware**  
   If the game already supports a room/game ID in the URL, use that param (e.g. `?room=` or `?game=`). If not, fork the repo and add: read `room` from the URL and pass it to their server so both players join the same game. Serve each game at a path, e.g.:
   - `https://your-games.example.com/squareoff`
   - `https://your-games.example.com/breakout`
   - `https://your-games.example.com/spaceshooter`

3. **Configure the app**  
   In `app.json` → `extra` → `gameBaseUrl`, set the base URL (e.g. `https://your-games.example.com`). The app will open:
   - Square Off: `{gameBaseUrl}/squareoff?room={matchId}&opponent=...`
   - Breakout: `{gameBaseUrl}/breakout?room=...`
   - Space Shooter: `{gameBaseUrl}/spaceshooter?room=...`

## Repos and integration notes

### Square Off! (ScriptaGames/SquareOff)

- **Repo:** https://github.com/ScriptaGames/SquareOff  
- **Stack:** client + server + common; `npm start`, open two windows to play.  
- **Integration:** Run their full stack. Add support for `?room=` on the client (send to server) so both players join the same game. Serve at `/squareoff`.

### Breakout (Couchfriends/breakout)

- **Repo:** https://github.com/Couchfriends/breakout  
- **Stack:** Grunt build, `build/index.html`; multiplayer may use Couchfriends’ backend.  
- **Integration:** Check their source for how rooms work. Add `?room=` support if needed, deploy, serve at `/breakout`.

### Space-Shooter (Couchfriends/Space-Shooter)

- **Repo:** https://github.com/Couchfriends/Space-Shooter  
- **Stack:** Similar to Breakout; play at couchfriends.com/games.html.  
- **Integration:** Same as Breakout: room support, deploy, serve at `/spaceshooter`.

## App-side wiring (already done)

- **game-webview:** Builds URL as `{gameBaseUrl}/{path}?room=...` for `squareoff`, `breakout`, `spaceshooter`.
- **match-chat:** Play menu has Square Off!, Breakout, Space Shooter.
- **functions.tsx, notifications, _layout:** Game labels and invite types use these three game types.
