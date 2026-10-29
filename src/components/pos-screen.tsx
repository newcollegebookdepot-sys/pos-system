"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saleLedgerMath, WALK_IN_ID } from "@/lib/domain/ledger";
import { checkoutTotals, discPrefillFromBatch, displayUnitPrice } from "@/lib/domain/pricing";
import { balText, formatMoney, moneyToInput, tryParseMoney } from "@/lib/money";
import {
  buildCartLine,
  clearCartAction,
  completeSale,
  discardDraft,
  loadDrafts,
  parkDraft,
  removeCartLine,
  resumeDraft,
  searchPosBatches,
  searchPosCustomers,
} from "@/server/pos";
import type { Batch, Customer, InvoiceLine, SaleUnit } from "@/lib/types";

type CartLine = InvoiceLine & { clientKey: string };

export function PosScreen({
  walkIn,
  showDrafts,
}: {
  walkIn: Customer;
  showDrafts?: boolean;
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer>(walkIn);
  const [custQ, setCustQ] = useState("");
  const [custHits, setCustHits] = useState<Customer[]>([]);
  const [itemQ, setItemQ] = useState("");
  const [itemHits, setItemHits] = useState<Batch[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [saleUnit, setSaleUnit] = useState<SaleUnit>("pcs");
  const [qty, setQty] = useState("");
  const [discDisplay, setDiscDisplay] = useState("");
  const [retailDisplay, setRetailDisplay] = useState("");
  const [discPct, setDiscPct] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [billDisc, setBillDisc] = useState("");
  const [paid, setPaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof loadDrafts>>>([]);
  const [showDraftModal, setShowDraftModal] = useState(!!showDrafts);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      void searchPosCustomers(custQ).then(setCustHits);
    }, 120);
    return () => clearTimeout(t);
  }, [custQ]);

  useEffect(() => {
    const t = setTimeout(() => {
      void searchPosBatches(itemQ).then(setItemHits);
    }, 120);
    return () => clearTimeout(t);
  }, [itemQ]);

  useEffect(() => {
    if (showDraftModal) void loadDrafts().then(setDrafts);
  }, [showDraftModal]);

  function selectBatch(b: Batch) {
    setBatch(b);
    setSaleUnit(b.packSize > 1 ? "pcs" : "pcs");
    setQty("");
    const disc = discPrefillFromBatch({ retailCents: b.retailCents, wholesaleCents: b.wholesaleCents });
    setDiscDisplay(moneyToInput(displayUnitPrice(disc, "pcs", b.packSize)));
    setRetailDisplay(moneyToInput(displayUnitPrice(b.retailCents, "pcs", b.packSize)));
    setDiscPct("");
    setItemQ(b.name);
    setItemHits([]);
  }

  function applyUnit(unit: SaleUnit) {
    if (!batch) return;
    setSaleUnit(unit);
    const discPiece = tryParseMoney(discDisplay);
    const retailPiece = tryParseMoney(retailDisplay);
    // reinterpret current fields as piece if switching - simpler: reset from batch
    const disc = discPrefillFromBatch({ retailCents: batch.retailCents, wholesaleCents: batch.wholesaleCents });
    setDiscDisplay(moneyToInput(displayUnitPrice(disc, unit, batch.packSize)));
    setRetailDisplay(moneyToInput(displayUnitPrice(batch.retailCents, unit, batch.packSize)));
    void discPiece;
    void retailPiece;
  }

  const preview = useMemo(() => {
    if (!batch) return null;
    const qn = Number(qty);
    const disc = tryParseMoney(discDisplay);
    const retail = tryParseMoney(retailDisplay);
    if (!qn || qn < 1 || disc == null || retail == null) return null;
    const pack = batch.packSize;
    const qtyPcs = saleUnit === "pkt" ? qn * pack : qn;
    const discPiece = saleUnit === "pkt" && pack > 1 ? Math.round(disc / pack) : disc;
    const retailPiece = saleUnit === "pkt" && pack > 1 ? Math.round(retail / pack) : retail;
    const total = discPiece * qtyPcs;
    const saved = Math.max(0, retailPiece - discPiece) * qtyPcs;
    return { qtyPcs, total, saved, discPiece, retailPiece };
  }, [batch, qty, discDisplay, retailDisplay, saleUnit]);

  const totals = useMemo(() => {
    const bill = tryParseMoney(billDisc) ?? 0;
    return checkoutTotals(
      cart.map((l) => ({
        retailTotalCents: l.retailTotalCents,
        lineTotalCents: l.lineTotalCents,
        savedCents: l.savedCents,
      })),
      bill,
    );
  }, [cart, billDisc]);

  const ledger = useMemo(() => {
    const paidCents = tryParseMoney(paid) ?? 0;
    return saleLedgerMath(customer, totals.grand, paidCents);
  }, [customer, totals.grand, paid]);

  function addLine() {
    if (!batch || !preview) return;
    const clientKey = `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setError(null);
    start(async () => {
      const result = await buildCartLine({
        batchId: batch.id,
        saleUnit,
        qty: Number(qty),
        retailDisplayCents: tryParseMoney(retailDisplay) || 0,
        discDisplayCents: tryParseMoney(discDisplay) || 0,
        clientKey,
      });
      if (result.error || !result.line) {
        setError(result.error || "Could not add line");
        return;
      }
      setCart((c) => [...c, result.line!]);
      setQty("");
      setBatch(null);
      setItemQ("");
    });
  }

  function removeLine(key: string) {
    start(async () => {
      await removeCartLine(key);
      setCart((c) => c.filter((l) => l.clientKey !== key));
    });
  }

  function clearCart() {
    if (cart.length && !window.confirm("Clear the cart and release reserved stock?")) return;
    start(async () => {
      await clearCartAction();
      setCart([]);
    });
  }

  function finalize() {
    if (!cart.length) return;
    setError(null);
    start(async () => {
      const result = await completeSale({
        customerId: customer.id,
        billDiscountCents: tryParseMoney(billDisc) ?? 0,
        paidCents: tryParseMoney(paid) ?? 0,
        lines: cart,
      });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("invoiceId" in result) {
        setCart([]);
        setBillDisc("");
        setPaid("");
        router.push(`/invoices/${result.invoiceId}?print=1`);
      }
    });
  }

  const salePanel = saleUnit === "pkt" ? "pos-sale-panel pos-sale-pkt" : "pos-sale-panel pos-sale-pcs";

  return (
    <div className="screen-pos">
      <div className="topbar">
        <div>
          <h1>New sale</h1>
          <p className="muted">Qty starts empty. Disc list chips fill disc price.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowDraftModal(true)}>
            Sale drafts
          </button>
        </div>
      </div>

      <div className="grid-2">
        <section className="box">
          <h2>Customer & item</h2>
          <div className="pos-cust-bar ac" style={{ position: "relative", marginBottom: 10 }}>
            <label className="label" htmlFor="cust">
              Customer
            </label>
            <input
              id="cust"
              className="field"
              value={custQ}
              placeholder="Search name or phone"
              onChange={(e) => setCustQ(e.target.value)}
            />
            <p className="muted" style={{ marginTop: 6 }}>
              <span className="strong" style={{ color: "var(--text)" }}>
                {customer.name}
              </span>{" "}
              · {balText(customer.balanceCents)}
              {customer.balanceCents < 0 && customer.id !== WALK_IN_ID ? " · Surplus will auto-apply" : ""}
            </p>
            {custQ.trim() ? (
              <div className="ac-list open">
                {custHits.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="ac-item"
                    style={{ width: "100%", background: "transparent", border: 0, color: "inherit" }}
                    onClick={() => {
                      setCustomer(c);
                      setCustQ("");
                    }}
                  >
                    <span>
                      {c.name} <span className="muted">{c.phone}</span>
                    </span>
                    <span className="mono">{balText(c.balanceCents)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="pos-add">
            <div className="pos-entry">
              <div className="pos-entry-row pos-entry-search-row ac" style={{ position: "relative" }}>
                <div className="pos-entry-search">
                  <label className="label" htmlFor="item">
                    Item
                  </label>
                  <input
                    id="item"
                    className="field"
                    value={itemQ}
                    placeholder="Search name, Batch N, category"
                    onChange={(e) => {
                      setItemQ(e.target.value);
                      setBatch(null);
                    }}
                  />
                </div>
                {itemQ.trim() && !batch ? (
                  <div className="ac-list open">
                    {itemHits.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className="ac-item"
                        style={{ width: "100%", background: "transparent", border: 0, color: "inherit", flexDirection: "column", alignItems: "stretch" }}
                        onClick={() => selectBatch(b)}
                      >
                        <span className="strong">
                          {b.name} · Batch {b.batchNo}
                        </span>
                        <span className="muted">
                          {b.category} · {b.stockPcs} pcs · {formatMoney(b.retailCents)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {batch ? (
                <>
                  <div className="pos-entry-row pos-entry-meta">
                    <div className="pos-meta-chip">
                      <span className="pos-meta-k">Pack</span>
                      <span className="pos-meta-v">{batch.packSize > 1 ? `${batch.packSize}/pkt` : "Loose"}</span>
                    </div>
                    <div className="pos-meta-chip">
                      <span className="pos-meta-k">Stock</span>
                      <span className="pos-meta-v">{batch.stockPcs} pcs</span>
                    </div>
                    <div className="pos-meta-chip pos-meta-buy">
                      <span className="pos-meta-k">Buy</span>
                      <span className="pos-meta-v">{formatMoney(batch.buyCents)}</span>
                    </div>
                    <div className="pos-meta-chip pos-meta-disc">
                      <span className="pos-meta-k">Disc list</span>
                      {batch.wholesaleCents ? (
                        <div className="ac-price-row">
                          <button
                            type="button"
                            className="ac-price"
                            onClick={() =>
                              setDiscDisplay(moneyToInput(displayUnitPrice(batch.wholesaleCents!, "pcs", batch.packSize)))
                            }
                          >
                            /pc {formatMoney(batch.wholesaleCents)}
                          </button>
                          {batch.packSize > 1 ? (
                            <button
                              type="button"
                              className="ac-price ac-price-pkt"
                              onClick={() => {
                                applyUnit("pkt");
                                setDiscDisplay(moneyToInput(displayUnitPrice(batch.wholesaleCents!, "pkt", batch.packSize)));
                              }}
                            >
                              /pkt {formatMoney(batch.wholesaleCents * batch.packSize)}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="pos-meta-v muted">—</span>
                      )}
                    </div>
                  </div>

                  {batch.packSize > 1 ? (
                    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <button type="button" className={`btn btn-sm ${saleUnit === "pcs" ? "btn-primary" : "btn-secondary"}`} onClick={() => applyUnit("pcs")}>
                        Sell by piece
                      </button>
                      <button type="button" className={`btn btn-sm ${saleUnit === "pkt" ? "btn-primary" : "btn-secondary"}`} onClick={() => applyUnit("pkt")}>
                        Sell by packet
                      </button>
                    </div>
                  ) : null}

                  <div className={salePanel}>
                    <div className="pos-sale-panel-label">{saleUnit === "pkt" ? "Packet sale" : "Piece sale"}</div>
                    <div className={`pos-entry-row ${saleUnit === "pkt" ? "pos-entry-prices" : "pos-entry-pcs"}`}>
                      <div className="field-wrap pos-primary">
                        <label className="label">{saleUnit === "pkt" ? "Pkts" : "Pcs"}</label>
                        <input className="field" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" autoFocus />
                      </div>
                      <div className="field-wrap pos-primary field-disc">
                        <label className="label">Disc. price</label>
                        <input className="field" value={discDisplay} onChange={(e) => setDiscDisplay(e.target.value)} />
                      </div>
                      <div className="pos-sale-gap" aria-hidden />
                      <div className="field-wrap pos-retail">
                        <label className="label">Retail</label>
                        <input className="field" value={retailDisplay} onChange={(e) => setRetailDisplay(e.target.value)} />
                      </div>
                      <div className="field-wrap field-disc">
                        <label className="label">Disc %</label>
                        <input
                          className="field"
                          value={discPct}
                          onChange={(e) => {
                            setDiscPct(e.target.value);
                            const pct = Number(e.target.value);
                            const retail = tryParseMoney(retailDisplay);
                            if (retail != null && Number.isFinite(pct)) {
                              setDiscDisplay(moneyToInput(Math.round(retail * (1 - pct / 100))));
                            }
                          }}
                        />
                      </div>
                      <div className="field-wrap" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="btn btn-success" id="addLine" disabled={!preview || pending} onClick={addLine}>
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  {preview ? (
                    <div className="pos-preview">
                      <span className="pv-label">Line preview</span>
                      <span className="pv-math">
                        {preview.qtyPcs} pcs · saved {formatMoney(preview.saved)}
                      </span>
                      <span className="pv-total">{formatMoney(preview.total)}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="box">
          <h2>Checkout</h2>
          <div className="pos-cart-panel">
            <div className="pos-cart-panel-title">Cart lines</div>
            <div className="pos-cart-wrap">
              <table className="pos-cart-lines">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="right">Qty</th>
                    <th className="right">Amt</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">
                        No lines yet.
                      </td>
                    </tr>
                  ) : (
                    cart.map((l) => (
                      <tr key={l.clientKey}>
                        <td>
                          <div className="strong">{l.name}</div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            disc {formatMoney(l.discCents)} · saved {formatMoney(l.savedCents)}
                          </div>
                        </td>
                        <td className="right mono">{l.saleUnit === "pkt" ? `${l.packets} pkt` : `${l.qtyPcs} pcs`}</td>
                        <td className="right mono strong">{formatMoney(l.lineTotalCents)}</td>
                        <td className="right">
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLine(l.clientKey)}>
                            ×
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <dl style={{ marginTop: 12, display: "grid", gap: 6 }}>
            <Row k="Retail subtotal" v={formatMoney(totals.retailSubtotal)} />
            <Row k="Item discounts" v={formatMoney(totals.itemDiscount)} />
            <Row k="After item disc" v={formatMoney(totals.afterItem)} />
          </dl>
          <div style={{ marginTop: 10 }}>
            <label className="label" htmlFor="billDisc">
              Additional bill discount
            </label>
            <input id="billDisc" className="field" value={billDisc} onChange={(e) => setBillDisc(e.target.value)} />
          </div>
          <p className="card-value" style={{ marginTop: 10 }}>
            Grand {formatMoney(totals.grand)}
          </p>
          {ledger.surplusApplied > 0 ? (
            <p className="card-sub">Surplus applied {formatMoney(ledger.surplusApplied)}</p>
          ) : null}
          <p className="muted">Cash due after surplus: {formatMoney(ledger.afterSurplus)}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input className="field" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Cash paid" />
            <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => setPaid(moneyToInput(ledger.afterSurplus))}>
              Pay all
            </button>
          </div>
          {customer.id !== WALK_IN_ID ? (
            <p className="muted" style={{ marginTop: 8 }}>
              {ledger.unpaid > 0
                ? `Remaining dues ${formatMoney(ledger.unpaid)}`
                : ledger.excessCash > 0
                  ? `New surplus ${formatMoney(ledger.excessCash)}`
                  : "Cleared"}
            </p>
          ) : ledger.excessCash > 0 ? (
            <p style={{ color: "var(--red)", marginTop: 8, fontSize: 12 }}>Walk-in overpay is not kept as surplus.</p>
          ) : null}
          <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
            Est. profit staff-only (on finalize). Margin uses landed allocations.
          </p>
          {error ? (
            <p role="alert" style={{ color: "var(--red)", marginTop: 8, fontSize: 13 }}>
              {error}
            </p>
          ) : null}
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary btn-block" disabled={!cart.length || pending} onClick={finalize}>
              Finalize & print A4
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={!cart.length || pending}
              onClick={() =>
                start(async () => {
                  await parkDraft({
                    customerId: customer.id,
                    billDiscountCents: tryParseMoney(billDisc) ?? 0,
                    paidCents: tryParseMoney(paid) ?? 0,
                    cart,
                  });
                  setCart([]);
                  setBillDisc("");
                  setPaid("");
                })
              }
            >
              Park draft
            </button>
            <button type="button" className="btn btn-danger btn-block" onClick={clearCart}>
              Clear cart
            </button>
          </div>
        </aside>
      </div>

      {showDraftModal ? (
        <div className="modal-bg open no-print" style={{ display: "flex" }}>
          <div className="modal">
            <div className="modal-h">
              <h2 style={{ margin: 0, fontSize: 18 }}>Sale drafts</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowDraftModal(false)}>
                Close
              </button>
            </div>
            <ul style={{ listStyle: "none", display: "grid", gap: 8 }}>
              {drafts.map((d) => (
                <li key={d.id} className="pos-draft-bar" style={{ justifyContent: "space-between" }}>
                  <div>
                    <p className="strong" style={{ margin: 0 }}>
                      {d.draftNumber} · {d.customerName}
                    </p>
                    <p className="muted" style={{ margin: 0 }}>
                      {d.cart.length} lines
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        start(async () => {
                          if (cart.length && !window.confirm("Park current cart first? Resume will replace cart.")) return;
                          if (cart.length) {
                            await parkDraft({
                              customerId: customer.id,
                              billDiscountCents: tryParseMoney(billDisc) ?? 0,
                              paidCents: tryParseMoney(paid) ?? 0,
                              cart,
                            });
                          }
                          const res = await resumeDraft(d.id);
                          if (res.error || !res.draft) return;
                          setCart(res.draft.cart as CartLine[]);
                          setBillDisc(moneyToInput(res.draft.billDiscountCents));
                          setPaid(moneyToInput(res.draft.paidCents));
                          setShowDraftModal(false);
                          router.refresh();
                        })
                      }
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => start(() => discardDraft(d.id).then(() => loadDrafts().then(setDrafts)))}
                    >
                      Discard
                    </button>
                  </div>
                </li>
              ))}
              {drafts.length === 0 ? <p className="muted">No drafts.</p> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <dt className="muted">{k}</dt>
      <dd className="mono strong" style={{ margin: 0 }}>
        {v}
      </dd>
    </div>
  );
}
