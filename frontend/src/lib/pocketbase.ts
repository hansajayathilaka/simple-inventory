import PocketBase from "pocketbase";

// Single configured PocketBase client for the whole app. The backend URL is
// resolved from VITE_PB_URL so the same build runs standalone (localhost) or
// against a LAN server without code changes. Electron can also inject the URL
// at runtime via window.__PB_URL__.
declare global {
  interface Window {
    __PB_URL__?: string;
  }
}

export const PB_URL =
  (typeof window !== "undefined" && window.__PB_URL__) ||
  import.meta.env.VITE_PB_URL ||
  "http://127.0.0.1:8090";

export const pb = new PocketBase(PB_URL);

// Keep auth state out of cross-tab autocancellation surprises.
pb.autoCancellation(false);

// Absolute URL for a record file (e.g. product image).
export function fileUrl(
  record: { id: string; collectionId?: string; collectionName?: string },
  filename: string,
  thumb?: string
): string {
  if (!filename) return "";
  return pb.files.getUrl(record, filename, thumb ? { thumb } : undefined);
}
