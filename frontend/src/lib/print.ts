// Printing abstraction. In the Electron desktop build a `window.desktop` bridge
// (see electron/preload.js) provides OS printer enumeration and silent printing
// to a chosen device. In the browser we fall back to the standard print dialog
// via a hidden iframe.

export interface DesktopBridge {
  getPrinters: () => Promise<{ name: string; displayName?: string }[]>;
  printHTML: (
    html: string,
    options: { deviceName?: string; silent?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.desktop;
}

export async function listPrinters(): Promise<string[]> {
  if (!window.desktop) return [];
  try {
    const printers = await window.desktop.getPrinters();
    return printers.map((p) => p.name);
  } catch {
    return [];
  }
}

// Print an HTML document string. Uses silent desktop printing when available and
// requested; otherwise opens the browser print dialog through a hidden iframe.
export async function printHTML(
  html: string,
  opts: { deviceName?: string; silent?: boolean } = {}
): Promise<void> {
  if (window.desktop && opts.silent) {
    const res = await window.desktop.printHTML(html, {
      deviceName: opts.deviceName,
      silent: true,
    });
    if (!res.ok) throw new Error(res.error || "Silent print failed");
    return;
  }

  // Browser fallback: render into a hidden iframe and invoke print().
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error("Unable to create print frame");
  }
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((r) => setTimeout(r, 250)); // let assets (barcodes) render
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

// Serialize a DOM node into a standalone printable HTML document.
export function nodeToDocument(node: HTMLElement, extraCss = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  ${extraCss}
</style></head><body>${node.outerHTML}</body></html>`;
}
