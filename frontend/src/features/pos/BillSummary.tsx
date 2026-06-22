import type { RefObject } from "react";
import type { CartLine } from "./types";

// Right-top region: a READ-ONLY summary of the bill. No inputs — editing a line
// happens back on the left editor. The table is keyboard-navigable: the
// container is focusable and ↑/↓ + PgUp/PgDn move the selection, Enter loads the
// selected line into the editor, Delete removes it.
export default function BillSummary({
  cart,
  selected,
  containerRef,
  cur,
  onSelect,
  onEdit,
  onRemove,
}: {
  cart: CartLine[];
  selected: number;
  containerRef: RefObject<HTMLDivElement>;
  cur: (n: number) => string;
  onSelect: (i: number) => void;
  onEdit: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const move = (delta: number) =>
    onSelect(Math.min(cart.length - 1, Math.max(0, selected + delta)));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (cart.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
      case "PageDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        move(-1);
        break;
      case "Enter":
        e.preventDefault();
        if (cart[selected]) onEdit(selected);
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        if (cart[selected]) onRemove(selected);
        break;
    }
  };

  return (
    <div
      className="pos-summary"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <table className="pos-summary-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Code</th>
            <th className="num">Qty</th>
            <th className="num">Disc</th>
            <th className="num">Unit price</th>
            <th className="num">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cart.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty">
                Add items from the left to build the bill.
              </td>
            </tr>
          ) : (
            cart.map((l, i) => (
              <tr
                key={i}
                className={i === selected ? "row-selected" : ""}
                onClick={() => onEdit(i)}
                title="Click to edit on the left"
              >
                <td>{l.product.name}</td>
                <td>
                  <code>{l.product.sku}</code>
                </td>
                <td className="num">{l.qty}</td>
                <td className="num">{l.discount ? cur(l.discount) : "—"}</td>
                <td className="num">{cur(l.unit_price)}</td>
                <td className="num">
                  {cur(Math.max(0, l.qty * l.unit_price - l.discount))}
                </td>
                <td className="num">
                  <button
                    className="btn btn-sm btn-ghost"
                    tabIndex={-1}
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
