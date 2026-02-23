# Push to GitHub and run the games

## 1. Push to GitHub

In the Spill folder, run:

```bash
cd /Users/muhammad-zain/Desktop/spill

# Stage all game-related changes (app, game-ttt, docs)
git add .gitignore READY_MADE_GAMES.md GAME_DEPLOY_STEPS.md GAME_SETUP.md
git add app/ game-ttt/
git add game-ttt/repos/chess/ game-ttt/repos/tictactoe/ game-ttt/repos/squareoff/ game-ttt/repos/breakout/ game-ttt/repos/spaceshooter/

# Commit
git commit -m "Ready-made games: Chess, Tic-Tac-Toe, Square Off, Breakout, Space Shooter"

# Push (use your branch name if not master/main)
git push origin master
```

If your default branch is `main`:

```bash
git push origin main
```

---

## 2. Run the games server locally

```bash
cd /Users/muhammad-zain/Desktop/spill/game-ttt
npm install
npm start
```

Then open in a browser:

- http://localhost:3000 — landing page with links
- http://localhost:3000/chess?room=test
- http://localhost:3000/tictactoe?room=test
- http://localhost:3000/squareoff
- http://localhost:3000/breakout
- http://localhost:3000/spaceshooter

---

## 3. Deploy so the app can use the games (Render)

Your app uses `gameBaseUrl` in `app.json` (e.g. `https://spill-tf8i.onrender.com`).

1. **Push** (step 1 above) so GitHub has the latest code.
2. **Render:** Open your [Render dashboard](https://dashboard.render.com), select the service that hosts the games (the one whose Root Directory is `game-ttt`).
3. Click **Manual Deploy** → **Deploy latest commit** (or wait for auto-deploy if it’s enabled).
4. When the deploy is **Live**, the app’s Play menu will load games from that URL.

---

## 4. Run the Spill app (Expo)

```bash
cd /Users/muhammad-zain/Desktop/spill
npm install
npx expo start
```

Then open the app on a device or simulator and use **Play** in a match to open a game.
