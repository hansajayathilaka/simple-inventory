import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../../services";
import type { AppSettings, FeatureFlags } from "../../types";
import { errorMessage } from "../../lib/errors";
import { availableSymbologies } from "../../lib/barcode";
import { isDesktop, listPrinters } from "../../lib/print";

const FEATURE_LABELS: Record<keyof FeatureFlags, string> = {
  customers: "Customers",
  returns: "Returns",
  purchasing: "Purchasing",
  suppliers: "Suppliers",
  reports: "Reports",
  loyalty: "Loyalty points",
  tags: "Tag stickers",
  discounts: "Discounts",
};

type Draft = Pick<
  AppSettings,
  | "company_name"
  | "company_address"
  | "company_phone"
  | "currency_symbol"
  | "theme"
  | "features"
  | "receipt"
  | "label"
  | "printers"
>;

export default function SettingsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["app_settings", "edit"],
    queryFn: () => settingsService.get(),
  });

  useEffect(() => {
    if (settings && !draft) {
      const { company_name, company_address, company_phone, currency_symbol, theme, features, receipt, label, printers: pr } = settings;
      setDraft({ company_name, company_address, company_phone, currency_symbol, theme, features, receipt, label, printers: pr });
    }
  }, [settings, draft]);

  useEffect(() => {
    if (isDesktop()) listPrinters().then(setPrinters);
  }, []);

  const save = useMutation({
    mutationFn: () => {
      if (!settings || !draft) throw new Error("Not loaded");
      if (logo) {
        const fd = new FormData();
        fd.append("company_name", draft.company_name ?? "");
        fd.append("company_address", draft.company_address ?? "");
        fd.append("company_phone", draft.company_phone ?? "");
        fd.append("currency_symbol", draft.currency_symbol ?? "");
        fd.append("theme", JSON.stringify(draft.theme));
        fd.append("features", JSON.stringify(draft.features));
        fd.append("receipt", JSON.stringify(draft.receipt));
        fd.append("label", JSON.stringify(draft.label));
        fd.append("printers", JSON.stringify(draft.printers));
        fd.append("logo", logo);
        return settingsService.update(settings.id, fd);
      }
      return settingsService.update(settings.id, draft as Partial<AppSettings>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const symbologies = useMemo(() => availableSymbologies(), []);

  if (isLoading || !draft) return <div className="empty">Loading…</div>;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setTheme = (k: keyof Draft["theme"], v: string) =>
    set({ theme: { ...draft.theme, [k]: v } });
  const setReceipt = (k: keyof Draft["receipt"], v: unknown) =>
    set({ receipt: { ...draft.receipt, [k]: v } });
  const setLabel = (k: keyof Draft["label"], v: unknown) =>
    set({ label: { ...draft.label, [k]: v } });
  const setPrinter = (k: keyof Draft["printers"], v: unknown) =>
    set({ printers: { ...draft.printers, [k]: v } });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="muted">Customize the shop, theme, features, printing and bills.</div>
        </div>
        <div className="inline">
          {saved && <span className="badge ok">Saved</span>}
          <button className="btn btn-primary" onClick={() => { setError(""); save.mutate(); }} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid grid-2">
        {/* Company */}
        <div className="card">
          <h2>Company</h2>
          <div className="field">
            <label>Company name</label>
            <input value={draft.company_name ?? ""} onChange={(e) => set({ company_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Address</label>
            <input value={draft.company_address ?? ""} onChange={(e) => set({ company_address: e.target.value })} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>Phone</label>
              <input value={draft.company_phone ?? ""} onChange={(e) => set({ company_phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Currency symbol</label>
              <input value={draft.currency_symbol ?? ""} placeholder="$, €, Rs…" onChange={(e) => set({ currency_symbol: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Logo</label>
            <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        {/* Theme */}
        <div className="card">
          <h2>Theme colors</h2>
          {(["primary", "sidebar", "accent"] as const).map((k) => (
            <div className="field inline" key={k} style={{ alignItems: "center" }}>
              <input
                type="color"
                value={draft.theme[k]}
                onChange={(e) => setTheme(k, e.target.value)}
                style={{ width: 48, padding: 2 }}
              />
              <input value={draft.theme[k]} onChange={(e) => setTheme(k, e.target.value)} style={{ flex: 1 }} />
              <span className="muted" style={{ width: 70 }}>{k}</span>
            </div>
          ))}
          <p className="muted">Changes apply across the app after saving.</p>
        </div>

        {/* Features */}
        <div className="card">
          <h2>Features</h2>
          {(Object.keys(FEATURE_LABELS) as (keyof FeatureFlags)[]).map((k) => (
            <div className="checkbox" key={k} style={{ marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={!!draft.features[k]}
                onChange={(e) => set({ features: { ...draft.features, [k]: e.target.checked } })}
              />
              <label style={{ margin: 0 }}>{FEATURE_LABELS[k]}</label>
            </div>
          ))}
        </div>

        {/* Printers */}
        <div className="card">
          <h2>Printing</h2>
          {!isDesktop() && (
            <p className="muted">
              Silent printing & printer selection are available in the desktop app.
              In the browser, the system print dialog is used.
            </p>
          )}
          <div className="checkbox" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={!!draft.printers.silent} onChange={(e) => setPrinter("silent", e.target.checked)} />
            <label style={{ margin: 0 }}>Silent printing (no dialog)</label>
          </div>
          {(["receiptPrinter", "labelPrinter"] as const).map((k) => (
            <div className="field" key={k}>
              <label>{k === "receiptPrinter" ? "Receipt printer" : "Label printer"}</label>
              {printers.length > 0 ? (
                <select value={draft.printers[k]} onChange={(e) => setPrinter(k, e.target.value)}>
                  <option value="">System default</option>
                  {printers.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input value={draft.printers[k]} placeholder="Printer name" onChange={(e) => setPrinter(k, e.target.value)} />
              )}
            </div>
          ))}
        </div>

        {/* Receipt / bill */}
        <div className="card">
          <h2>Bill / receipt</h2>
          <div className="field">
            <label>Header line</label>
            <input value={draft.receipt.header} onChange={(e) => setReceipt("header", e.target.value)} />
          </div>
          <div className="field">
            <label>Footer line</label>
            <input value={draft.receipt.footer} onChange={(e) => setReceipt("footer", e.target.value)} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>Paper width (mm)</label>
              <input type="number" value={draft.receipt.paperWidthMm} onChange={(e) => setReceipt("paperWidthMm", Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Font size (px)</label>
              <input type="number" value={draft.receipt.fontSizePt} onChange={(e) => setReceipt("fontSizePt", Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Tag labels */}
        <div className="card">
          <h2>Tag stickers</h2>
          <div className="grid grid-3">
            <div className="field">
              <label>Width (mm)</label>
              <input type="number" value={draft.label.widthMm} onChange={(e) => setLabel("widthMm", Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Height (mm)</label>
              <input type="number" value={draft.label.heightMm} onChange={(e) => setLabel("heightMm", Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Columns</label>
              <input type="number" value={draft.label.columns} onChange={(e) => setLabel("columns", Number(e.target.value))} />
            </div>
          </div>
          <div className="field">
            <label>Barcode symbology</label>
            <select value={draft.label.symbology} onChange={(e) => setLabel("symbology", e.target.value)}>
              {symbologies.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="inline">
            {(["showName", "showPrice", "showBarcode"] as const).map((k) => (
              <div className="checkbox" key={k}>
                <input type="checkbox" checked={!!draft.label[k]} onChange={(e) => setLabel(k, e.target.checked)} />
                <label style={{ margin: 0 }}>{k.replace("show", "")}</label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
