export type Role = "cashier" | "manager";

export type ActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
};

export type PublicUser = {
  id: number;
  name: string;
  username: string;
  role: Role;
  active: boolean;
};

export type Settings = {
  shopName: string;
  currencySymbol: string;
  address: string;
  phone: string;
  lowStockThreshold: number;
  printTerms: string;
  operatorName: string;
};

export type Operator = {
  id: number;
  name: string;
  active: boolean;
};

export type Batch = {
  id: number;
  name: string;
  batchNo: number;
  batchKey: string;
  category: string;
  packSize: number;
  stockPcs: number;
  buyCents: number;
  freightCents: number;
  landedCents: number;
  wholesaleCents: number | null;
  retailCents: number;
  packingLabel: string | null;
  active: boolean;
  updatedAt: string;
};

export type CustomerType = "Regular" | "Office" | "School" | "Wholesale";

export type Customer = {
  id: number;
  name: string;
  phone: string;
  type: CustomerType;
  balanceCents: number;
  openingDuesCents: number;
  balanceManual: boolean;
  active: boolean;
};

export type SaleUnit = "pcs" | "pkt";
export type InvoiceStatus = "Paid" | "Partial" | "Unpaid";

export type InvoiceLine = {
  id?: number;
  name: string;
  saleUnit: SaleUnit;
  packSize: number;
  qtyPcs: number;
  packets: number;
  retailCents: number;
  discCents: number;
  discPct: number;
  retailTotalCents: number;
  savedCents: number;
  lineTotalCents: number;
  allocations: { batchId: number; batchNo: number; qty: number; landedCents: number }[];
};

export type Invoice = {
  id: number;
  invoiceNumber: string;
  isoDate: string;
  createdAt: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  customerType: string;
  operatorName: string;
  retailSubtotalCents: number;
  itemDiscountCents: number;
  subtotalCents: number;
  billDiscountCents: number;
  grandTotalCents: number;
  paidCents: number;
  unpaidCents: number;
  profitCents: number;
  surplusAppliedCents: number;
  prevBalanceCents: number;
  closingBalanceCents: number;
  status: InvoiceStatus;
  lines: InvoiceLine[];
};

export type CartLine = InvoiceLine & { clientKey: string };
