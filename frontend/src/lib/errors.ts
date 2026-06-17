// Extract a human-readable message from a PocketBase ClientResponseError.
export function errorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  const e = err as {
    message?: string;
    response?: { message?: string; data?: Record<string, { message?: string }> };
  };
  const fieldErrors = e.response?.data;
  if (fieldErrors && Object.keys(fieldErrors).length > 0) {
    const parts = Object.entries(fieldErrors)
      .map(([k, v]) => `${k}: ${v?.message ?? ""}`)
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return e.response?.message || e.message || "Request failed";
}
