import { DatabaseSync } from "node:sqlite";

const d = new DatabaseSync("data/pos.sqlite");
d.prepare("UPDATE settings SET currency_symbol = ? WHERE id = 1").run("Rs.");
console.log(d.prepare("SELECT shop_name, currency_symbol FROM settings").get());
d.close();
