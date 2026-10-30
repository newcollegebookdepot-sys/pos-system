# POS — offline shop guide (non-technical)

This POS runs on **one computer** in the shop.  
All data is stored in a local file: **`data/pos.sqlite`**.  
No Vercel / Turso needed for normal use.

| Mode | When | Commands | Database |
|------|------|----------|----------|
| **Dev** | Testing changes | `npm run dev` | `data/pos.sqlite` |
| **Shop (production)** | Real counter use | `npm run build` then `npm run start:shop` | `data/pos.sqlite` |

**First-time setup on a PC:** see **[HOW-TO-LOCAL.md](./HOW-TO-LOCAL.md)**.

---

## Shop day (production)

1. Open the project folder in a terminal.
2. If you just updated the code: `npm install` then `npm run build`.
3. Start the shop server:

```text
npm run start:shop
```

4. Leave that window open. Open a browser: **http://localhost:3000**
5. End of day: click the terminal → **Ctrl+C** to stop.

**Do not** run `npm run dev` and `npm run start:shop` at the same time.

---

## After code changes (safe order)

1. Stop the server (Ctrl+C).
2. `npm install` (only if packages changed).
3. Test with `npm run dev` if you want.
4. Stop dev (Ctrl+C).
5. `npm run build`
6. `npm run start:shop`

---

## Backup (important)

Your shop books are **`data/pos.sqlite`**.

1. Stop the app first (Ctrl+C).
2. Copy `data/pos.sqlite` to a USB drive or a `backups` folder, e.g. `pos-2026-10-30.sqlite`.
3. Start the app again.

Do this regularly (daily is best).

**Restore:** stop app → replace `data/pos.sqlite` with the backup file (same name) → start again.

---

## Do not do these

- Do **not** run `npm run danger:wipe-turso` (legacy cloud wipe — can destroy cloud data if env vars are set).
- Do **not** delete the `data` folder.
- Do **not** set `POS_USE_TURSO=1` unless a technical person asks you to use cloud DB.

---

## If something breaks

1. Confirm only one server is running.
2. Hard-refresh the browser (Ctrl+F5).
3. Check the terminal for red errors.
4. Ask for technical help — do not run wipe scripts.
