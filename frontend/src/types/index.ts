import type { RecordModel } from "pocketbase";

// Domain models mirror the PocketBase collections (see docs/data-model.md).
// They extend RecordModel so we keep PB system fields (id, created, expand, ...).

export type Role = "owner" | "cashier";

export interface User extends RecordModel {
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface Category extends RecordModel {
  name: string;
  description?: string;
  parent?: string;
}

export interface Uom extends RecordModel {
  name: string;
  abbreviation: string;
}

export interface Brand extends RecordModel {
  name: string;
  description?: string;
}

export interface Ingredient extends RecordModel {
  name: string;
  description?: string;
}

export interface Supplier extends RecordModel {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active?: boolean;
}

export type AttributeType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "relation";

// Registry row for an owner-created reference collection (a "custom lookup").
// `name` is the real PocketBase collection name (e.g. "lk_color").
export interface LookupCollection extends RecordModel {
  name: string;
  label: string;
}

// A generic reference-list row. Built-in and custom lookups all share this
// minimal shape (name + optional description) for CRUD purposes.
export interface LookupItem extends RecordModel {
  name: string;
  description?: string;
}

export interface AttributeDefinition extends RecordModel {
  key: string;
  label: string;
  type: AttributeType;
  options?: { values?: string[] } | null;
  target_collection?: string;
  is_required?: boolean;
  is_multiple?: boolean;
  applies_to: "product";
  sort_order?: number;
}

export interface Product extends RecordModel {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category?: string;
  base_uom?: string;
  cost_price?: number;
  sell_price: number;
  tax_rate?: number;
  image?: string;
  is_active?: boolean;
  attributes?: Record<string, unknown>;
}

export interface Inventory extends RecordModel {
  product: string;
  qty_on_hand: number;
  reorder_level: number;
}

export type MovementType =
  | "purchase"
  | "restock"
  | "sale"
  | "return"
  | "adjustment";

export interface StockMovement extends RecordModel {
  product: string;
  type: MovementType;
  qty: number;
  unit_cost?: number;
  reference?: string;
  note?: string;
  created_by?: string;
}

export interface Customer extends RecordModel {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  loyalty_points?: number;
}

export type InvoiceStatus =
  | "draft"
  | "paid"
  | "void"
  | "partially_returned"
  | "returned";

export interface Invoice extends RecordModel {
  number: string;
  customer?: string;
  cashier: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  payment_method?: "cash" | "card" | "other";
  status: InvoiceStatus;
  note?: string;
  amount_tendered?: number;
  change_given?: number;
}

export interface InvoiceItem extends RecordModel {
  invoice: string;
  product: string;
  qty: number;
  unit_price: number;
  discount?: number;
  tax_rate?: number;
  line_total: number;
  // total cost of the stock lots this line consumed (for margin reporting)
  cost_total?: number;
}

export type BatchSourceType =
  | "opening"
  | "purchase"
  | "restock"
  | "return"
  | "adjustment";

// A stock lot: a quantity of a product received together, with its own cost and
// selling price. qty_remaining is drawn down FIFO as items are sold.
export interface StockBatch extends RecordModel {
  product: string;
  qty_received: number;
  qty_remaining: number;
  unit_cost?: number;
  sell_price?: number;
  source_type: BatchSourceType;
  source_reference?: string;
  received_at?: string;
  note?: string;
  created_by?: string;
}

// Records which lot (and how much of it) an invoice line consumed.
export interface InvoiceItemBatch extends RecordModel {
  invoice_item: string;
  batch?: string;
  product: string;
  qty: number;
  unit_cost?: number;
}

export interface PurchaseOrder extends RecordModel {
  reference?: string;
  supplier: string;
  status: "draft" | "received" | "cancelled";
  total_cost?: number;
  note?: string;
  created_by?: string;
  received_at?: string;
}

export interface PurchaseOrderItem extends RecordModel {
  purchase_order: string;
  product: string;
  qty: number;
  unit_cost: number;
  line_total?: number;
}

export interface Return extends RecordModel {
  number: string;
  invoice: string;
  refund_total: number;
  reason?: string;
  cashier: string;
}

export interface ReturnItem extends RecordModel {
  return: string;
  invoice_item?: string;
  product: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

// --- App settings (customization panel) ---

export interface FeatureFlags {
  customers: boolean;
  returns: boolean;
  purchasing: boolean;
  suppliers: boolean;
  reports: boolean;
  loyalty: boolean;
  tags: boolean;
  discounts: boolean;
}

export interface ThemeSettings {
  primary: string;
  sidebar: string;
  accent: string;
}

export interface ReceiptSettings {
  header: string;
  footer: string;
  showLogo: boolean;
  paperWidthMm: number;
  fontSizePt: number;
}

// Symbology is a free string so new barcode types can be added without a schema
// change (see lib/barcode.ts for the swappable renderer).
export interface LabelSettings {
  widthMm: number;
  heightMm: number;
  columns: number;
  symbology: string;
  showName: boolean;
  showPrice: boolean;
  showBarcode: boolean;
}

export interface PrinterSettings {
  receiptPrinter: string;
  labelPrinter: string;
  silent: boolean;
}

export interface AppSettings extends RecordModel {
  company_name: string;
  company_address?: string;
  company_phone?: string;
  logo?: string;
  currency_symbol?: string;
  theme: ThemeSettings;
  features: FeatureFlags;
  receipt: ReceiptSettings;
  label: LabelSettings;
  printers: PrinterSettings;
}

// --- POS request/response payloads (custom routes) ---

export interface CheckoutLine {
  product: string;
  qty: number;
  unit_price: number;
  discount?: number;
}

export interface CheckoutPayload {
  customer?: string;
  items: CheckoutLine[];
  discount_total?: number;
  payment_method?: "cash" | "card" | "other";
  amount_tendered?: number;
  note?: string;
}

export interface CheckoutResult {
  id: string;
  number: string;
  grand_total: number;
  change_given?: number;
}

export interface ReturnPayload {
  invoice: string;
  reason?: string;
  items: { invoice_item: string; qty: number }[];
}

export interface ReturnResult {
  id: string;
  number: string;
  refund_total: number;
}
