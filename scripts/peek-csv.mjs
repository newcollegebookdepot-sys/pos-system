import fs from "node:fs";

const prod = fs.readFileSync("D:/NCBD Project/Book1-ncbd-products.csv", "utf8");
const lines = prod.split(/\r?\n/).filter(Boolean);
console.log("product rows", lines.length - 1);
console.log("header", lines[0]);
console.log("sample", lines.slice(1, 4));

const cust = fs.readFileSync("D:/NCBD Project/customer_dues_import.csv", "utf8");
const cl = cust.split(/\r?\n/).filter(Boolean);
console.log("customer rows", cl.length - 1);
console.log(cl.slice(0, 15));

// Check Chrome Local Storage for file:// or localhost for ncbd
import path from "node:path";
const local = path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data", "Default", "Local Storage", "leveldb");
console.log("chrome ls exists", fs.existsSync(local));
if (fs.existsSync(local)) {
  const files = fs.readdirSync(local).filter((f) => f.endsWith(".log") || f.endsWith(".ldb"));
  let found = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(local, f));
    const text = buf.toString("utf8");
    if (text.includes("ncbd_pro")) {
      console.log("HIT in", f, "size", buf.length);
      found++;
    }
  }
  console.log("ncbd hits", found);
}
