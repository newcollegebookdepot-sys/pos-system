import { DatabaseSync } from "node:sqlite";

const d = new DatabaseSync("data/pos.sqlite");
console.log("batches", d.prepare("SELECT COUNT(*) c FROM batches").get().c);
console.log("customers", d.prepare("SELECT COUNT(*) c FROM customers").get().c);
console.log(
  "dues total Rs",
  (d.prepare("SELECT SUM(balance_cents) s FROM customers WHERE balance_cents>0").get().s || 0) / 100,
);
console.log("sample batches:");
for (const r of d.prepare("SELECT name, stock_pcs, buy_cents, retail_cents, category FROM batches ORDER BY id LIMIT 5").all()) {
  console.log(r);
}
console.log("top dues:");
for (const r of d
  .prepare("SELECT name, balance_cents FROM customers WHERE balance_cents>0 ORDER BY balance_cents DESC LIMIT 5")
  .all()) {
  console.log(r.name, "Rs.", r.balance_cents / 100);
}
d.close();
