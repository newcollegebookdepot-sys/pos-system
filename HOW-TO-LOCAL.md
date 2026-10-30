# Run the POS on your computer (offline)

The shop runs **entirely on this PC**.  
Database file: **`data/pos.sqlite`** (created/used automatically).

There is no separate “cloud shop” for normal use.  
See **[HOW-TO.md](./HOW-TO.md)** for production / backup rules.

---

## One-time setup

### 1. Install Node.js

1. Open [https://nodejs.org](https://nodejs.org)
2. Download the **LTS** version (big green button)
3. Run the installer → Next → Finish
4. Restart the PC if asked

Check in Terminal / PowerShell:

```text
node -v
```

You should see something like `v22.x.x`.

### 2. Open the project

Open the folder that contains `package.json` (Cursor, VS Code, or GitHub Desktop).

---

## Development (test changes)

1. Terminal → New Terminal in the project folder  
2. First time (or after updates):

```text
npm install
```

3. Start:

```text
npm run dev
```

4. Browser: **http://localhost:3000**  
5. Stop: **Ctrl+C** in the terminal  

In the terminal you should see a line like:  
`[pos] database: local SQLite (data/pos.sqlite)`  
If you see Turso instead, something forced cloud mode — ask for help.

---

## Shop production (real counter)

Use this during business hours (faster/stabler than `dev`):

```text
npm run build
npm run start:shop
```

Browser: **http://localhost:3000**  
Stop: **Ctrl+C**

After pulling new code: stop → `npm install` (if needed) → `npm run build` → `npm run start:shop`.

**Never** run `dev` and `start:shop` at the same time.

---

## Important

| | |
|--|--|
| App URL | http://localhost:3000 |
| Shop data | `data/pos.sqlite` |
| Login secret | `data/session.secret` (auto) |
| Backup | Copy `data/pos.sqlite` while the app is **stopped** |

- Do **not** run `npm run danger:wipe-turso`.  
- Do **not** delete the `data` folder.  
- Other PCs on the same Wi‑Fi can open `http://THIS-PC-IP:3000` if Windows Firewall allows Node (optional).

---

## Common problems

**“npm is not recognized”**  
Install Node LTS and restart the PC.

**Page won’t open**  
Confirm the terminal still shows the server running. Use http://localhost:3000

**Port 3000 already in use**  
Stop the other terminal with Ctrl+C, then start again.

**Login fails**  
Use a user that exists in this PC’s `data/pos.sqlite`.

**App feels very slow**  
Should be local SQLite. Check the terminal for `[pos] database: local SQLite`. If it says Turso, unset cloud env and restart.

---

## Short checklists

**Dev:** `npm install` → `npm run dev` → http://localhost:3000 → Ctrl+C when done  

**Shop:** `npm run build` → `npm run start:shop` → http://localhost:3000 → backup `data/pos.sqlite` regularly  
