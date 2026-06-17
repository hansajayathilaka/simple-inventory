import { pb } from "../lib/pocketbase";
import { collection } from "./crud";
import type {
  AttributeDefinition,
  Brand,
  Category,
  CheckoutPayload,
  CheckoutResult,
  Customer,
  Ingredient,
  Inventory,
  Invoice,
  InvoiceItem,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  Return,
  ReturnItem,
  ReturnPayload,
  ReturnResult,
  StockMovement,
  Supplier,
  Uom,
  User,
} from "../types";

// Collection services
export const usersService = collection<User>("users");
export const categoriesService = collection<Category>("categories");
export const uomService = collection<Uom>("uom");
export const brandsService = collection<Brand>("brands");
export const ingredientsService = collection<Ingredient>("ingredients");
export const suppliersService = collection<Supplier>("suppliers");
export const attributesService =
  collection<AttributeDefinition>("attribute_definitions");
export const productsService = collection<Product>("products");
export const inventoryService = collection<Inventory>("inventory");
export const movementsService = collection<StockMovement>("stock_movements");
export const customersService = collection<Customer>("customers");
export const invoicesService = collection<Invoice>("invoices");
export const invoiceItemsService = collection<InvoiceItem>("invoice_items");
export const purchaseOrdersService = collection<PurchaseOrder>("purchase_orders");
export const purchaseOrderItemsService = collection<PurchaseOrderItem>(
  "purchase_order_items"
);
export const returnsService = collection<Return>("returns");
export const returnItemsService = collection<ReturnItem>("return_items");

// Map a lookup collection name to its service (used by dynamic relation attrs).
export const lookupServices: Record<string, ReturnType<typeof collection>> = {
  categories: categoriesService,
  uom: uomService,
  brands: brandsService,
  ingredients: ingredientsService,
  suppliers: suppliersService,
};

// --- Custom server-side routes (business logic) ---

export const posService = {
  checkout: (payload: CheckoutPayload) =>
    pb.send<CheckoutResult>("/api/pos/checkout", {
      method: "POST",
      body: payload,
    }),
  returnGoods: (payload: ReturnPayload) =>
    pb.send<ReturnResult>("/api/pos/return", {
      method: "POST",
      body: payload,
    }),
};

export const stockService = {
  restock: (body: {
    product: string;
    qty: number;
    unit_cost?: number;
    note?: string;
  }) =>
    pb.send<{ movement: string; qty_on_hand: number }>(
      "/api/inventory/restock",
      { method: "POST", body }
    ),
  adjust: (body: { product: string; qty: number; note: string }) =>
    pb.send<{ movement: string; qty_on_hand: number }>(
      "/api/inventory/adjust",
      { method: "POST", body }
    ),
  receivePurchaseOrder: (id: string) =>
    pb.send<{ id: string; status: string; total_cost: number }>(
      `/api/purchasing/receive/${id}`,
      { method: "POST", body: {} }
    ),
};
