# Run the POS on your computer (non-technical)

This starts a **practice / development** copy of the shop on your PC.  
It does **not** change the live website. Live sales stay on Vercel + Turso.

For updating the live site after changes, see **HOW-TO.md**.

---

## One-time setup

### 1. Install Node.js

1. Open [https://nodejs.org](https://nodejs.org)
2. Download the **LTS** version (big green button)
3. Run the installer → Next → Next → Finish
4. Restart the computer if the installer asks you to

To check it worked: open **Terminal** (or PowerShell) and type:

```text
node -v
```

You should see a version like `v22.x.x`. If you see an error, Node is not installed correctly.

### 2. Get the project folder

Use whichever way you already have the code:

- **GitHub Desktop:** clone or open the `pos-system` repository, **or**
- Open the folder in **Cursor** / VS Code if it is already on this PC

You need to be inside the folder that contains `package.json` (the project root).

---

## Start the app (every day)

1. Open the project in Cursor (or VS Code)
2. Open a terminal: menu **Terminal → New Terminal**
3. **First time only** in this folder (or after someone adds new packages), run:

```text
npm install
```

Wait until it finishes (can take a few minutes).

4. Start the local server:

```text
npm run dev
```

5. Leave that terminal window open. When it is ready, open a browser and go to:

**http://localhost:3000**

6. Sign in with a shop username and password (same style as the live site; this uses the **local** database file).

---

## Stop the app

Click the terminal window, then press:

**Ctrl + C**

If it asks to confirm, press **Y** then Enter.

---

## Important (read once)

| Local (your PC) | Live shop (customers / counter) |
|-----------------|----------------------------------|
| `http://localhost:3000` | Your Vercel URL |
| Data in `data/pos.sqlite` | Data in Turso cloud |
| Safe to click around and test | Real money / real invoices |

- Local and live data are **separate**. A sale on localhost does **not** appear on the live site.
- Do **not** run `npm run danger:wipe-turso` — that can delete the **live** cloud database.
- You do **not** need Turso or Vercel env vars just to run locally.

---

## Common problems

**“npm is not recognized”**  
Node.js is missing or the PC was not restarted after install. Reinstall Node LTS, restart, try again.

**Page won’t open / “This site can’t be reached”**  
Make sure `npm run dev` is still running in the terminal. Then open http://localhost:3000 again.

**Port 3000 already in use**  
Another copy of the app may still be running. Close other terminals, or stop them with Ctrl+C, then run `npm run dev` again.

**Red errors after `npm install` or `npm run dev`**  
Copy the error text and ask for technical help. Do not run wipe/Turso scripts to “fix” it.

**Login fails locally**  
Use an account that exists in the local `data/pos.sqlite` (from this project). Live-only passwords may differ if data was never synced.

---

## Short checklist

1. `npm install` (first time)
2. `npm run dev`
3. Browser → http://localhost:3000
4. When done → Ctrl+C in the terminal
