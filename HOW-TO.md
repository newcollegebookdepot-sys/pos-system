# POS — simple guide (non-technical)

Live shop data lives in **Turso** (cloud). The website is on **Vercel**. Code is on **GitHub**.

**First time on a new PC?** See **[HOW-TO-LOCAL.md](./HOW-TO-LOCAL.md)** (install Node, `npm install`, `npm run dev`).

## Everyday work (safe)

1. Change the app on your computer.
2. Test locally — see **HOW-TO-LOCAL.md** (`npm run dev`; uses the local file database — not the live shop).
3. Push to GitHub branch **`main`**.
4. Wait ~1–2 minutes. Vercel updates the live site by itself.

**That is all.** Schema/table changes in the code are applied on the live database automatically after deploy. You do **not** run database scripts for normal updates.

## Do not do these (can wipe the real shop)

- Do **not** run `npm run danger:wipe-turso` (or anything with “wipe” / “push-turso”).
- Do **not** delete or change Environment Variables on Vercel (`TURSO_*`, `SESSION_SECRET`) unless someone technical asks you to.
- Do **not** replace the live database with your local `data/pos.sqlite` after go-live — local and live data will differ; live is the real books.

## If something looks broken after a push

1. Open the Vercel project → Deployments → open the latest one → check it is **Ready** (not Error).
2. Hard-refresh the site (Ctrl+F5) and try again.
3. If it still fails, ask for technical help — do not run wipe scripts.

## First-time cloud setup (already done if the site works)

Only needed once: Turso database, Vercel project linked to `main`, and three secrets (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`). After that, only Git pushes.
