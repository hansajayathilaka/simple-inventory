import type { Product } from "../../types";

// A line in the bill being built. `lot` records which stock lot's price was
// chosen on the left editor — it is display-only and is NOT sent to checkout
// (the server draws stock/cost FIFO regardless). See docs decision: lot pick =
// price only.
export interface CartLine {
  product: Product;
  qty: number;
  unit_price: number;
  discount: number;
  lot?: string;
}

// A label/value pair shown in the read-only product detail card.
export interface DetailRow {
  label: string;
  value: string;
}

// Seed payload used to load an existing cart line back into the left editor.
export interface EditSeed {
  line: CartLine;
  nonce: number;
}
