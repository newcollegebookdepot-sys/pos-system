"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { calcContractLine, type CtEntryKind, type CtSaleMode } from "@/lib/domain/contracts";
import { formatMoney, moneyToInput, tryParseMoney } from "@/lib/money";
import {
  apiContractsForOffice,
  apiSearchBoq,
  apiSearchOffices,
  apiSuggestInvoiceNumber,
  saveComposerInvoice,
} from "@/server/contracts/invoices";

type ContractOpt = Awaited<ReturnType<typeof apiContractsForOffice>>[number];
type BoqHit = Awaited<ReturnType<typeof apiSearchBoq>>[number];

type Line = {
  key: string;
  boqItemId: number | null;
  itemName: string;
  unit: string;
  saleMode: CtSaleMode;
  qty: string;
  packetComparative: string;
  packetNcbd: string;
  pcsPerPacket: string;
  pcsSold: string;
  comparativeSerial: number | null;
  comparativeListed: boolean;
  entryKind: CtEntryKind;
};

type Bootstrap = {
  invoiceId: number;
  contractId: number;
  officeName: string;
  contractHead: string;
  firmName: string;
  invoiceNumber: string;
  isoDate: string;
  notes: string;
  status: string;
  demandNo: string;
  entryKind: CtEntryKind;
  lines: {
    boqItemId: number | null;
    itemName: string;
    unit: string;
    saleMode: CtSaleMode;
    qty: number;
    packetComparativeCents: number;
    packetNcbdCents: number;
    pcsPerPacket: number | null;
    pcsSold: number | null;
    comparativeSerial: number | null;
    comparativeListed: boolean;
    entryKind: CtEntryKind;
  }[];
};

function newKey() {
  return `L${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyLine(kind: CtEntryKind, mode: CtSaleMode): Line {
  return {
    key: newKey(),
    boqItemId: null,
    itemName: "",
    unit: "",
    saleMode: mode,
    qty: "1",
    packetComparative: "",
    packetNcbd: "",
    pcsPerPacket: "",
    pcsSold: "",
    comparativeSerial: null,
    comparativeListed: true,
    entryKind: kind,
  };
}

export function ContractInvoiceComposer({
  today,
  bootstrap,
  presetContractId,
  presetOfficeName,
  presetFirmName,
  presetVendor,
  presetHead,
}: {
  today: string;
  bootstrap?: Bootstrap | null;
  presetContractId?: number;
  presetOfficeName?: string;
  presetFirmName?: string;
  presetVendor?: string;
  presetHead?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [officeQ, setOfficeQ] = useState(bootstrap?.officeName || presetOfficeName || "");
  const [offices, setOffices] = useState<string[]>([]);
  const [contracts, setContracts] = useState<ContractOpt[]>([]);
  const [contractId, setContractId] = useState(bootstrap?.contractId || presetContractId || 0);
  const [firmName, setFirmName] = useState(bootstrap?.firmName || presetFirmName || "");
  const [vendor, setVendor] = useState(presetVendor || "");
  const [invoiceNumber, setInvoiceNumber] = useState(bootstrap?.invoiceNumber || "");
  const [isoDate, setIsoDate] = useState(bootstrap?.isoDate || today);
  const [demandNo, setDemandNo] = useState(bootstrap?.demandNo || "");
  const [notes, setNotes] = useState(bootstrap?.notes || "");
  const [entryKind, setEntryKind] = useState<CtEntryKind>(bootstrap?.entryKind || "normal");
  const [saleMode, setSaleMode] = useState<CtSaleMode>("unit");
  const [pcsPerPacketDefault, setPcsPerPacketDefault] = useState("");
  const [boqQ, setBoqQ] = useState("");
  const [boqHits, setBoqHits] = useState<BoqHit[]>([]);
  const [lines, setLines] = useState<Line[]>(() => {
    if (bootstrap?.lines.length) {
      return bootstrap.lines.map((l) => ({
        key: newKey(),
        boqItemId: l.boqItemId,
        itemName: l.itemName,
        unit: l.unit,
        saleMode: l.saleMode,
        qty: String(l.qty || 1),
        packetComparative: moneyToInput(l.packetComparativeCents),
        packetNcbd: moneyToInput(l.packetNcbdCents),
        pcsPerPacket: l.pcsPerPacket != null ? String(l.pcsPerPacket) : "",
        pcsSold: l.pcsSold != null ? String(l.pcsSold) : "",
        comparativeSerial: l.comparativeSerial,
        comparativeListed: l.comparativeListed,
        entryKind: l.entryKind,
      }));
    }
    return [];
  });

  useEffect(() => {
    const t = setTimeout(() => {
      void apiSearchOffices(officeQ).then(setOffices);
    }, 120);
    return () => clearTimeout(t);
  }, [officeQ]);

  useEffect(() => {
    if (!officeQ.trim()) {
      setContracts([]);
      return;
    }
    void apiContractsForOffice(officeQ.trim()).then((list) => {
      setContracts(list);
      if (contractId) {
        const hit = list.find((c) => c.id === contractId);
        if (hit) {
          setFirmName(hit.firmName);
          setVendor(hit.vendorNumber);
        } else if (presetContractId && presetHead) {
          setContracts((cur) =>
            cur.some((c) => c.id === presetContractId)
              ? cur
              : [
                  {
                    id: presetContractId,
                    officeName: presetOfficeName || officeQ,
                    contractHead: presetHead,
                    firmId: 0,
                    firmName: presetFirmName || "",
                    vendorNumber: presetVendor || "",
                    label: `${presetHead} · ${presetFirmName || ""}`,
                  },
                  ...cur,
                ],
          );
        }
      }
    });
  }, [
    officeQ,
    contractId,
    presetContractId,
    presetHead,
    presetOfficeName,
    presetFirmName,
    presetVendor,
  ]);

  useEffect(() => {
    if (!contractId || bootstrap?.invoiceNumber) return;
    void apiSuggestInvoiceNumber(contractId).then(setInvoiceNumber);
  }, [contractId, bootstrap?.invoiceNumber]);

  useEffect(() => {
    if (!contractId || !boqQ.trim()) {
      setBoqHits([]);
      return;
    }
    const t = setTimeout(() => {
      void apiSearchBoq(contractId, boqQ).then(setBoqHits);
    }, 120);
    return () => clearTimeout(t);
  }, [contractId, boqQ]);

  const priced = useMemo(() => {
    return lines.map((line) => {
      try {
        const p = calcContractLine({
          saleMode: line.saleMode,
          qty: Number(line.qty),
          unit: line.unit,
          packetComparativeCents: tryParseMoney(line.packetComparative) ?? 0,
          packetNcbdCents: tryParseMoney(line.packetNcbd) ?? 0,
          pcsPerPacket: line.pcsPerPacket ? Number(line.pcsPerPacket) : null,
          pcsSold: line.pcsSold ? Number(line.pcsSold) : null,
        });
        return { ok: true as const, line, priced: p };
      } catch (e) {
        return { ok: false as const, line, error: e instanceof Error ? e.message : "Invalid" };
      }
    });
  }, [lines]);

  const totals = useMemo(() => {
    let compr = 0;
    let ncbd = 0;
    for (const row of priced) {
      if (row.ok) {
        compr += row.priced.comparativeTotalCents;
        ncbd += row.priced.ncbdTotalCents;
      }
    }
    return { compr, ncbd, margin: compr - ncbd };
  }, [priced]);

  function selectContract(id: number) {
    setContractId(id);
    const hit = contracts.find((c) => c.id === id);
    if (hit) {
      setFirmName(hit.firmName);
      setVendor(hit.vendorNumber);
      setOfficeQ(hit.officeName);
    }
  }

  function addBoq(hit: BoqHit) {
    setLines((cur) => [
      ...cur,
      {
        ...emptyLine(entryKind, saleMode),
        boqItemId: hit.id,
        itemName: hit.itemName,
        unit: hit.unit || (saleMode === "pieces" ? "Pcs" : ""),
        packetComparative: moneyToInput(hit.comparativeCents),
        packetNcbd: moneyToInput(hit.ncbdCents),
        comparativeSerial: hit.comparativeListed ? hit.serialNumber : null,
        comparativeListed: hit.comparativeListed,
        pcsPerPacket: saleMode === "pieces" ? pcsPerPacketDefault : "",
        qty: saleMode === "unit" ? "1" : "",
        pcsSold: saleMode === "pieces" ? "1" : "",
      },
    ]);
    setBoqQ("");
    setBoqHits([]);
  }

  function save() {
    setError(null);
    if (!contractId) {
      setError("Select an office contract.");
      return;
    }
    start(async () => {
      const res = await saveComposerInvoice({
        invoiceId: bootstrap?.invoiceId,
        contractId,
        invoiceNumber,
        isoDate,
        notes,
        demandNo,
        entryKind,
        lines: lines.map((l) => ({
          boqItemId: l.boqItemId,
          itemName: l.itemName,
          unit: l.unit,
          saleMode: l.saleMode,
          qty: Number(l.qty) || undefined,
          packetComparativeCents: tryParseMoney(l.packetComparative) ?? 0,
          packetNcbdCents: tryParseMoney(l.packetNcbd) ?? 0,
          pcsPerPacket: l.pcsPerPacket ? Number(l.pcsPerPacket) : null,
          pcsSold: l.pcsSold ? Number(l.pcsSold) : null,
          comparativeListed: l.comparativeListed,
          comparativeSerial: l.comparativeSerial,
          entryKind: l.entryKind,
          demandNo,
        })),
      });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("invoiceId" in res) router.push(`/contracts/invoices/${res.invoiceId}`);
    });
  }

  return (
    <div className="grid gap-4">
      <section className="box">
        <h2>Office & firm</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <label className="label">Office name</label>
            <input
              className="field"
              value={officeQ}
              onChange={(e) => setOfficeQ(e.target.value)}
              placeholder="Search office…"
              disabled={!!bootstrap}
            />
            {!bootstrap && officeQ.trim() && offices.length > 0 ? (
              <div className="ac-list open">
                {offices.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className="ac-item"
                    style={{ width: "100%", border: 0, background: "transparent", color: "inherit" }}
                    onClick={() => setOfficeQ(o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="lg:col-span-2">
            <label className="label">Head · firm</label>
            <select
              className="field"
              value={contractId || ""}
              disabled={!!bootstrap}
              onChange={(e) => selectContract(Number(e.target.value))}
            >
              <option value="">Select…</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Invoice date</label>
            <input type="date" className="field" value={isoDate} onChange={(e) => setIsoDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Invoice no.</label>
            <input className="field" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>
          <div>
            <label className="label">Demand no.</label>
            <input className="field" value={demandNo} onChange={(e) => setDemandNo(e.target.value)} />
          </div>
        </div>
        {firmName ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Firm <strong style={{ color: "var(--text)" }}>{firmName}</strong>
            {vendor ? ` · Vendor ${vendor}` : ""}
          </p>
        ) : null}
      </section>

      <section className="box">
        <h2>Sale as</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Mode</label>
            <select
              className="field"
              value={saleMode}
              onChange={(e) => setSaleMode(e.target.value as CtSaleMode)}
            >
              <option value="unit">Packet / listed unit</option>
              <option value="pieces">Pieces (from packet rate)</option>
            </select>
          </div>
          {saleMode === "pieces" ? (
            <div>
              <label className="label">Default pcs in packet</label>
              <input
                className="field"
                value={pcsPerPacketDefault}
                onChange={(e) => setPcsPerPacketDefault(e.target.value)}
                placeholder="10"
              />
            </div>
          ) : null}
          <div>
            <label className="label">Entry kind</label>
            <select
              className="field"
              value={entryKind}
              onChange={(e) => setEntryKind(e.target.value as CtEntryKind)}
            >
              <option value="normal">Normal (counts to head)</option>
              <option value="cash_alternate">Cash alternate</option>
            </select>
          </div>
        </div>
      </section>

      <section className="box">
        <h2>Add from BOQ</h2>
        <div className="relative">
          <input
            className="field"
            value={boqQ}
            onChange={(e) => setBoqQ(e.target.value)}
            placeholder={contractId ? "Search serial or item…" : "Select contract first"}
            disabled={!contractId}
          />
          {boqHits.length ? (
            <div className="ac-list open">
              {boqHits.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="ac-item"
                  style={{ width: "100%", border: 0, background: "transparent", color: "inherit" }}
                  onClick={() => addBoq(b)}
                >
                  <span>
                    <span className="strong">#{b.serialNumber}</span> {b.itemName}
                  </span>
                  <span className="mono">{formatMoney(b.comparativeCents)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="box">
        <h2>Lines</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Mode</th>
                <th className="right">Qty</th>
                <th className="right">Compr</th>
                <th className="right">NCBD</th>
                <th className="right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {priced.map((row) => (
                <tr key={row.line.key}>
                  <td>
                    <input
                      className="field"
                      value={row.line.itemName}
                      onChange={(e) =>
                        setLines((cur) =>
                          cur.map((l) => (l.key === row.line.key ? { ...l, itemName: e.target.value } : l)),
                        )
                      }
                    />
                    {row.line.comparativeSerial != null ? (
                      <span className="muted">#{row.line.comparativeSerial}</span>
                    ) : null}
                  </td>
                  <td className="muted">{row.line.saleMode}</td>
                  <td className="right">
                    {row.line.saleMode === "pieces" ? (
                      <div className="grid gap-1">
                        <input
                          className="field"
                          placeholder="pcs/pkt"
                          value={row.line.pcsPerPacket}
                          onChange={(e) =>
                            setLines((cur) =>
                              cur.map((l) => (l.key === row.line.key ? { ...l, pcsPerPacket: e.target.value } : l)),
                            )
                          }
                        />
                        <input
                          className="field"
                          placeholder="pcs sold"
                          value={row.line.pcsSold}
                          onChange={(e) =>
                            setLines((cur) =>
                              cur.map((l) => (l.key === row.line.key ? { ...l, pcsSold: e.target.value } : l)),
                            )
                          }
                        />
                      </div>
                    ) : (
                      <input
                        className="field"
                        value={row.line.qty}
                        onChange={(e) =>
                          setLines((cur) =>
                            cur.map((l) => (l.key === row.line.key ? { ...l, qty: e.target.value } : l)),
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="right">
                    <input
                      className="field"
                      value={row.line.packetComparative}
                      onChange={(e) =>
                        setLines((cur) =>
                          cur.map((l) =>
                            l.key === row.line.key ? { ...l, packetComparative: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="right">
                    <input
                      className="field"
                      value={row.line.packetNcbd}
                      onChange={(e) =>
                        setLines((cur) =>
                          cur.map((l) => (l.key === row.line.key ? { ...l, packetNcbd: e.target.value } : l)),
                        )
                      }
                    />
                  </td>
                  <td className="right mono">
                    {row.ok ? formatMoney(row.priced.comparativeTotalCents) : <span className="text-stamp">!</span>}
                  </td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setLines((cur) => cur.filter((l) => l.key !== row.line.key))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length === 0 ? <p className="muted">Add items from BOQ.</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-3">
          <div>
            <label className="label">Notes</label>
            <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minWidth: 240 }} />
          </div>
          <div className="text-right">
            <p className="card-value">{formatMoney(totals.compr)}</p>
            <p className="card-sub">Comparative · NCBD {formatMoney(totals.ncbd)} · margin {formatMoney(totals.margin)}</p>
          </div>
        </div>
        {error ? (
          <p role="alert" style={{ color: "var(--red)", marginTop: 8 }}>
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" disabled={pending || !lines.length} onClick={save}>
            {pending ? "Saving…" : bootstrap ? "Update invoice" : "Save draft"}
          </button>
        </div>
      </section>
    </div>
  );
}
