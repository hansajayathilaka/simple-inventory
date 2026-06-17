// Lightweight formatting helpers. Currency symbol is intentionally generic;
// swap for a locale/currency setting later.
export function money(n: number | undefined | null): string {
  return (Number(n) || 0).toFixed(2);
}

export function dateTime(s: string | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function date(s: string | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}
