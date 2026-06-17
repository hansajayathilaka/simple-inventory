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
  return {
    list: (opts: ListOptions = {}) =>
      c.getList<T>(opts.page ?? 1, opts.perPage ?? 50, {
        sort: opts.sort ?? "-created",
        filter: opts.filter,
        expand: opts.expand,
      }),
    all: (opts: Omit<ListOptions, "page" | "perPage"> = {}) =>
      c.getFullList<T>({
        sort: opts.sort ?? "-created",
        filter: opts.filter,
        expand: opts.expand,
      }),
    one: (id: string, expand?: string) => c.getOne<T>(id, { expand }),
    create: (data: Partial<T> | FormData) => c.create<T>(data),
    update: (id: string, data: Partial<T> | FormData) => c.update<T>(id, data),
    remove: (id: string) => c.delete(id),
  };
}
