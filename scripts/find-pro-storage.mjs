import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync("D:/NCBD Project/ncbd_pos_pro.html", "utf8");
for (const pat of ["ncbd_pro", "localStorage", "downloadBackup", "exportData", "backup", "LS_KEY", "STORAGE"]) {
  let i = 0;
  let hits = 0;
  while ((i = html.indexOf(pat, i)) >= 0 && hits < 8) {
    console.log(pat, "@", i, JSON.stringify(html.slice(Math.max(0, i - 40), i + 80)));
    i += pat.length;
    hits++;
  }
}

// Look for JSON backups in common places
const roots = [
  "D:/NCBD Project",
  "D:/NCBD Project/backups",
  "D:/NCBD Project/tmp",
  "C:/Users/UNII/Downloads",
  "C:/Users/UNII/Desktop",
  "C:/Users/UNII/Documents",
];
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const f of fs.readdirSync(root)) {
    const low = f.toLowerCase();
    if ((low.includes("ncbd") || low.includes("backup") || low.includes("pro")) && (low.endsWith(".json") || low.endsWith(".bak"))) {
      const p = path.join(root, f);
      const st = fs.statSync(p);
      console.log("CANDIDATE", p, st.size);
    }
  }
}
