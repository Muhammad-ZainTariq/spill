# Step-by-step: Deploy ready-made games and connect the app

The app uses **ready-made games only** (Square Off!, Breakout, Space Shooter). Deploy those games (or a server that serves them) and set the URL in the app.

---

## Step 1 – Install app dependency (one time)

In the **Spill project** folder (where `app.json` is):

```bash
cd /Users/muhammad-zain/Desktop/spill
npm install
```

(This installs `react-native-webview` and the rest. If you already ran it, you can skip.)

---

## Step 2 – Deploy the game to Render (free)

You’ll put the `game-ttt` folder on **Render** so it runs 24/7 and the app can open it.

### 2.1 Push `game-ttt` to GitHub (so Render can use it)

**Option A – Same repo as Spill**

If Spill is already in a GitHub repo:

1. Commit and push the `game-ttt` folder:
   ```bash
   cd /Users/muhammad-zain/Desktop/spill
   git add game-ttt
   git commit -m "Add game-ttt for Play with match"
   git push
   ```

2. On Render you’ll point the service to this repo and set the **Root Directory** to `game-ttt` (see below).

**Option B – New repo only for the game**

1. Create a new repo on GitHub (e.g. `spill-ttt`).
2. Copy only the game there:
   ```bash
   cd /Users/muhammad-zain/Desktop/spill
   cp -r game-ttt /tmp/spill-ttt
   cd /tmp/spill-ttt
   git init
   git add .
   git commit -m "Games server for Spill"
   git remote add origin https://github.com/YOUR_USERNAME/spill-ttt.git
   git branch -M main
   git push -u origin main
   ```
3. On Render you’ll connect this repo (no Root Directory needed).

### 2.2 Create a Web Service on Render

1. Go to [https://render.com](https://render.com) and sign in (or create a free account).
2. **Dashboard** → **New +** → **Web Service**.
3. Connect the repo that contains `game-ttt`:
   - If it’s the **Spill repo**: connect that repo, then set **Root Directory** to `game-ttt`.
   - If it’s a **separate repo** (Option B): connect that repo, leave Root Directory empty.
4. Settings:
   - **Name:** e.g. `spill-ttt`.
   - **Region:** pick one close to you.
   - **Runtime:** Node.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **Create Web Service**.
6. Wait until the service is **Live** (green). Render will show a URL like:
   `https://spill-ttt-xxxx.onrender.com`

### 2.3 Copy the live URL

Copy that **exact** URL (no path, no trailing slash), e.g.:

`https://spill-ttt-xxxx.onrender.com`

You’ll paste it into the app in Step 3.

---

## Step 3 – Set the game URL in the app

1. Open **`app.json`** in the Spill project.
2. Find the **`extra`** block. It should look like:
   ```json
   "extra": {
     "gameBaseUrl": "",
     "openaiApiKey": "..."
   }
   ```
3. Put the Render URL inside the quotes for `gameBaseUrl`:
   ```json
   "gameBaseUrl": "https://spill-ttt-xxxx.onrender.com"
   ```
   Use **your** Render URL from Step 2.3. No trailing slash.
4. Save the file.

---

## Step 4 – Test in the app

1. Rebuild or restart the app so it picks up the new `gameBaseUrl`.
2. Start a **match** with another user (or a second device).
3. In the match screen, tap **Play** (grid icon next to +15m).
4. The game screen should open and show “Connecting…” then “Waiting for opponent…” or the board.
5. On the **other** device (or in another browser with the same match), also tap **Play**.
6. Both should see the same game (Square Off, Breakout, or Space Shooter) and be able to play. Ensure each game is deployed at /squareoff, /breakout, /spaceshooter with ?room= support.

---

## If something doesn’t work

- **“Game URL not set”**  
  → `gameBaseUrl` in `app.json` is empty or wrong. Set it to your Render URL and restart the app.

- **“Connecting…” forever**  
  → Render service might be sleeping (free tier). Open the Render URL in a browser first to wake it; then try Play again. Or check that the URL in `app.json` is exactly the one from Render (https, no trailing slash).

- **Second player never joins**  
  → Both must tap Play from the **same** match (same match ID). Check that both devices have an active match together.

- **Render build fails**  
  → Ensure Root Directory is `game-ttt` if the repo is the main Spill repo. Build command: `npm install`. Start command: `npm start`.

---

## Summary checklist

- [ ] Ran `npm install` in the Spill project (Step 1)
- [ ] Pushed `game-ttt` to GitHub (Step 2.1)
- [ ] Created a Web Service on Render for `game-ttt` (Step 2.2)
- [ ] Copied the live Render URL (Step 2.3)
- [ ] Set `expo.extra.gameBaseUrl` in `app.json` to that URL (Step 3)
- [ ] Tested Play from an active match on two devices (Step 4)

After this, no further setup is needed; “Play” will always open the shared game for that match.
