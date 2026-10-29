import { DatabaseSync } from "node:sqlite";
const d = new DatabaseSync("data/pos.sqlite");
const late = d.prepare("SELECT name FROM batches WHERE active=1 ORDER BY name COLLATE NOCASE LIMIT 1 OFFSET 700").get();
console.log("late alpha", late);
const reg = d.prepare("SELECT name FROM batches WHERE lower(name) LIKE '%register%' LIMIT 5").all();
console.log("register hits", reg);
d.close();
