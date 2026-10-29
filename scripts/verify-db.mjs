import { DatabaseSync } from "node:sqlite";

const d = new DatabaseSync("data/pos.sqlite");
const tables = d
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1")
  .all()
  .map((r) => r.name);
console.log("tables:", tables.join(", "));
console.log("users:", d.prepare("SELECT username, role FROM users").all());
console.log("customers:", d.prepare("SELECT id, name FROM customers").all());
console.log("operators:", d.prepare("SELECT name FROM operators").all());
console.log("settings:", d.prepare("SELECT shop_name, currency_symbol FROM settings").get());
d.close();
