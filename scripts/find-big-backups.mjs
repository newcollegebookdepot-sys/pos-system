import fs from "node:fs";
import path from "node:path";

function walk(dir, depth = 0) {
  if (depth > 3) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "AppData") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.toLowerCase().includes("ncbd") || e.name.toLowerCase().includes("backup") || depth < 2) walk(p, depth + 1);
      continue;
    }
    const low = e.name.toLowerCase();
    if (!low.endsWith(".json")) continue;
    try {
      const st = fs.statSync(p);
      if (st.size < 1000) continue;
      if (low.includes("ncbd") || low.includes("backup") || low.includes("pro") || low.includes("pos")) {
        console.log(st.size, p);
      }
    } catch {}
  }
}

for (const root of [
  "C:/Users/UNII/Downloads",
  "C:/Users/UNII/Desktop",
  "C:/Users/UNII/Documents",
  "D:/NCBD Project",
  "D:/projects",
]) {
  if (fs.existsSync(root)) walk(root, 0);
}

// Try extract ncbd_pro_v4 from Chrome LevelDB by scanning for JSON blob
import { readdirSync, readFileSync, existsSync } from "node:fs";
const profiles = [
  path.join(process.env.LOCALAPPDATA, "Google/Chrome/User Data/Default/Local Storage/leveldb"),
  path.join(process.env.LOCALAPPDATA, "Google/Chrome/User Data/Profile 1/Local Storage/leveldb"),
  path.join(process.env.LOCALAPPDATA, "Microsoft/Edge/User Data/Default/Local Storage/leveldb"),
  path.join(process.env.LOCALAPPDATA, "BraveSoftware/Brave-Browser/User Data/Default/Local Storage/leveldb"),
];
for (const dir of profiles) {
  if (!existsSync(dir)) continue;
  console.log("scanning", dir);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ldb") && !f.endsWith(".log")) continue;
    const buf = readFileSync(path.join(dir, f));
    const idx = buf.indexOf(Buffer.from("ncbd_pro_v4"));
    if (idx < 0) continue;
    console.log("key hit", f, "at", idx);
    // Find nearby { ... } JSON
    const start = buf.indexOf(0x7b, idx); // {
    if (start < 0) continue;
    // Heuristic: look for large JSON after key
    let depth = 0;
    let end = -1;
    for (let i = start; i < Math.min(buf.length, start + 20_000_000); i++) {
      const c = buf[i];
      if (c === 0x7b) depth++;
      else if (c === 0x7d) {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end > start) {
      const slice = buf.slice(start, end + 1);
      console.log("candidate json bytes", slice.length);
      try {
        const obj = JSON.parse(slice.toString("utf8"));
        const out = path.join(process.cwd(), "data", "imported-ncbd-pro-v4.json");
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(obj));
        console.log("WROTE", out, "keys", Object.keys(obj));
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          console.log(" ", k, Array.isArray(v) ? v.length : typeof v);
        }
      } catch (e) {
        console.log("parse fail", e.message);
      }
    }
  }
}
