# Push to GitHub (run these yourself in Terminal)

The **Co-authored-by: Cursor** line is added by Cursor when commits are made from the IDE. To remove it and push clean:

## 1. Remove Co-authored-by from the last commit

Open **Terminal** (not Cursor’s terminal if it re-adds the line) and run:

```bash
cd /Users/muhammad-zain/Desktop/spill

# Replace the last commit message with only your title (no Cursor line)
git commit --amend -m "Ready-made games: Chess, Tic-Tac-Toe, Square Off, Breakout, Space Shooter"
```

## 2. Push to GitHub

If you already pushed this commit before, you need a force push because you changed the message:

```bash
# If your branch is master:
git push origin master --force-with-lease

# If your branch is main:
git push origin main --force-with-lease
```

If you **haven’t** pushed this commit yet:

```bash
git push origin master
# or
git push origin main
```

## 3. Stop Cursor from adding Co-authored-by on future commits

In Cursor: **Settings** → search for **“co-author”** or **“commit”** → turn off any option that adds “Co-authored-by” or “Cursor” to commit messages.

---

## Optional: run the games server locally

```bash
cd /Users/muhammad-zain/Desktop/spill/game-ttt
npm install
npm start
```

Then open http://localhost:3000 in a browser.
