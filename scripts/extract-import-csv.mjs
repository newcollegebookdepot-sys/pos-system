import fs from "node:fs";
const html = fs.readFileSync("D:/NCBD Project/ncbd_pos_pro.html", "utf8");
const i = html.indexOf("function importCsv(file)");
console.log(html.slice(i, i + 1800));
const j = html.indexOf("function importCustomers");
console.log("\n--- customers ---\n");
console.log(html.slice(j, j + 1500));
