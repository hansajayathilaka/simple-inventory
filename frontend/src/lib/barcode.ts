import JsBarcode from "jsbarcode";

// Swappable barcode renderer. Today it draws CODE128 via JsBarcode, but the
// `symbology` argument and the registry below let us add QR or other formats
// later without touching call sites — just register a new renderer.
export type BarcodeRenderer = (
  svg: SVGSVGElement,
  value: string,
  opts: { height?: number; fontSize?: number }
) => void;

const renderers: Record<string, BarcodeRenderer> = {
  CODE128: (svg, value, opts) => {
    JsBarcode(svg, value, {
      format: "CODE128",
      height: opts.height ?? 40,
      fontSize: opts.fontSize ?? 12,
      margin: 0,
      displayValue: true,
    });
  },
};

export function registerBarcodeRenderer(symbology: string, fn: BarcodeRenderer) {
  renderers[symbology.toUpperCase()] = fn;
}

export function availableSymbologies(): string[] {
  return Object.keys(renderers);
}

// Render `value` into the given <svg> using the named symbology (falls back to
// CODE128). Safe no-op on empty values.
export function renderBarcode(
  svg: SVGSVGElement,
  value: string,
  symbology = "CODE128",
  opts: { height?: number; fontSize?: number } = {}
): void {
  if (!value) return;
  const fn = renderers[symbology.toUpperCase()] ?? renderers.CODE128;
  try {
    fn(svg, value, opts);
  } catch {
    // invalid value for the symbology — leave the svg empty
  }
}
