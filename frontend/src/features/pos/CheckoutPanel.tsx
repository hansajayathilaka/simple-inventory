import { SearchSelect } from "../../components/SearchSelect";
import { customersService } from "../../services";
import type { Customer } from "../../types";

const PAYMENTS = ["cash", "card", "other"] as const;
export type Payment = (typeof PAYMENTS)[number];

// Right-bottom region: totals, full-bill discount, customer, payment and the
// "proceed with the bill" (Charge) button.
export default function CheckoutPanel({
  totals,
  invoiceDiscount,
  setInvoiceDiscount,
  customer,
  onCustomer,
  payment,
  setPayment,
  tendered,
  setTendered,
  changeDue,
  busy,
  canCharge,
  onCharge,
  cur,
}: {
  totals: { subtotal: number; discount: number; tax: number; grand: number };
  invoiceDiscount: number;
  setInvoiceDiscount: (n: number) => void;
  customer: string;
  onCustomer: (id: string, name: string) => void;
  payment: Payment;
  setPayment: (p: Payment) => void;
  tendered: string;
  setTendered: (v: string) => void;
  changeDue: number;
  busy: boolean;
  canCharge: boolean;
  onCharge: () => void;
  cur: (n: number) => string;
}) {
  return (
    <div className="pos-checkout">
      <div className="pos-totals">
        <div className="row">
          <span>Subtotal</span>
          <span>{cur(totals.subtotal)}</span>
        </div>
        <div className="row">
          <span>Full-bill discount</span>
          <input
            className="pos-num"
            type="number"
            min={0}
            step="any"
            value={invoiceDiscount || ""}
            onChange={(e) =>
              setInvoiceDiscount(Math.max(0, Number(e.target.value) || 0))
            }
            style={{ width: 120 }}
          />
        </div>
        <div className="row">
          <span>Tax</span>
          <span>{cur(totals.tax)}</span>
        </div>
        <div className="row grand">
          <span>TOTAL</span>
          <span>{cur(totals.grand)}</span>
        </div>
      </div>

      <div className="pos-pay">
        <SearchSelect<Customer>
          service={customersService}
          searchFields={["name", "phone"]}
          value={customer}
          onChange={(id, rec) => onCustomer(id, rec?.name ?? "")}
          placeholder="Walk-in customer"
        />
        <select
          value={payment}
          onChange={(e) => setPayment(e.target.value as Payment)}
          tabIndex={-1}
        >
          {PAYMENTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {payment === "cash" && (
        <div className="pos-cash">
          <div className="row">
            <span>Amount tendered</span>
            <input
              className="pos-num"
              type="number"
              min={0}
              step="any"
              placeholder="0.00"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              style={{ width: 130 }}
            />
          </div>
          <div className="row change">
            <span>Balance</span>
            <span className={changeDue < 0 ? "short" : ""}>
              {changeDue < 0 ? `Short ${cur(-changeDue)}` : cur(changeDue)}
            </span>
          </div>
        </div>
      )}

      <button
        className="btn btn-primary pos-charge"
        disabled={!canCharge || busy}
        onClick={onCharge}
      >
        {busy ? "…" : `Proceed — Charge ${cur(totals.grand)} (F9)`}
      </button>
    </div>
  );
}
