# Deploy the updated Chess (full-screen + move hints)

Your app already points to **Render** (`gameBaseUrl` in `app.json`). To get the new chess UI live, deploy the latest `game-ttt` code.

---

## Option 1: Same repo as Spill (game-ttt inside Spill)

If your Render Web Service is connected to the **Spill repo** and uses **Root Directory: `game-ttt`**:

### 1. Commit and push the updated game code

```bash
cd /Users/muhammad-zain/Desktop/spill
git add game-ttt/public/chess.html game-ttt/server.js
git commit -m "Chess: full-screen board and move hints"
git push origin main
```

(Use your real branch name if it’s not `main`.)

### 2. Let Render redeploy

- **Auto-deploy:** If Render is set to “Auto-Deploy” on push, it will redeploy in a few minutes.
- **Manual:** In [Render Dashboard](https://dashboard.render.com) → your `spill-ttt` (or game) service → **Manual Deploy** → **Deploy latest commit**.

### 3. Use the app

- Wait until the service shows **Live** (green).
- In the app, open a match → **Play** → **Chess**. If you still see the old UI, force-close the app and reopen, or pull-to-refresh the game screen (so the WebView doesn’t use a cached page).

---

## Option 2: Separate repo for the game

If `game-ttt` lives in its **own GitHub repo**:

### 1. Go into the game folder and push

```bash
cd /Users/muhammad-zain/Desktop/spill/game-ttt
git add public/chess.html server.js
git commit -m "Chess: full-screen board and move hints"
git push origin main
```

### 2. Redeploy on Render

- Render Dashboard → your game service → **Manual Deploy** → **Deploy latest commit** (or wait for auto-deploy).

### 3. Use the app

Same as Option 1 step 3.

---

## Checklist

- [ ] Committed `game-ttt/public/chess.html` and `game-ttt/server.js`
- [ ] Pushed to the repo that Render uses
- [ ] Render service is **Live** after deploy
- [ ] Opened Chess from the app (and refreshed if needed)

Your `gameBaseUrl` in `app.json` is already set (`https://spill-tf8i.onrender.com`), so no change there. After deploy, the app will load the new chess page from that URL.
