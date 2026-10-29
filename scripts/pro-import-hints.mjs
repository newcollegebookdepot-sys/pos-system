import fs from "node:fs";
const html = fs.readFileSync("D:/NCBD Project/ncbd_pos_pro.html", "utf8");
const keys = ["importCsv", "baseCost", "defaultPrice", "freightCost", "packSize", "wholesale", "discList", "importCustomers", "Total Dues"];
for (const k of keys) {
  let i = html.indexOf(k);
  let n = 0;
  while (i >= 0 && n < 3) {
    console.log("\n===", k, i, "===");
    console.log(html.slice(i - 80, i + 350));
    i = html.indexOf(k, i + 1);
    n++;
  }
}
