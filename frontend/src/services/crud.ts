import type { RecordModel } from "pocketbase";
import { pb } from "../lib/pocketbase";

// Generic typed CRUD wrapper over a PocketBase collection. Feature code calls
// these instead of touching the SDK directly, so the backend can evolve behind
// a stable service layer.
export interface ListOptions {
  page?: number;
  perPage?: number;
  sort?: string;
  filter?: string;
  expand?: string;
}

export function collection<T extends RecordModel>(name: string) {
  const c = pb.collection(name);

  // Build a query object that omits undefined values, otherwise the SDK
  // serializes them as the literal string "undefined" (e.g. `filter=undefined`),
  // which PocketBase rejects with a 400.
  const query = (opts: ListOptions) => {
    const q: Record<string, string> = { sort: opts.sort ?? "-created" };
    if (opts.filter != null) q.filter = opts.filter;
    if (opts.expand != null) q.expand = opts.expand;
    return q;
  };

  return {
    list: (opts: ListOptions = {}) =>
      c.getList<T>(opts.page ?? 1, opts.perPage ?? 50, query(opts)),
    all: (opts: Omit<ListOptions, "page" | "perPage"> = {}) =>
      c.getFullList<T>(query(opts)),
    one: (id: string, expand?: string) =>
      c.getOne<T>(id, expand ? { expand } : {}),
    create: (data: Partial<T> | FormData) => c.create<T>(data),
    update: (id: string, data: Partial<T> | FormData) => c.update<T>(id, data),
    remove: (id: string) => c.delete(id),
  };
}
