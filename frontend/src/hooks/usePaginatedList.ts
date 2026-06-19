import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { RecordModel } from "pocketbase";
import type { collection, ListOptions } from "../services/crud";

// Server-side paginated list backed by a collection service. Keeps page state
// and re-queries on page/filter/sort changes.
export function usePaginatedList<T extends RecordModel>(
  service: ReturnType<typeof collection<T>>,
  key: unknown[],
  opts: Omit<ListOptions, "page"> = {}
) {
  const [page, setPage] = useState(1);
  const perPage = opts.perPage ?? 25;

  const query = useQuery({
    queryKey: [...key, "page", page, opts.filter ?? "", opts.sort ?? ""],
    queryFn: () =>
      service.list({
        page,
        perPage,
        sort: opts.sort,
        filter: opts.filter,
        expand: opts.expand,
      }),
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  return {
    items: (data?.items ?? []) as T[],
    page,
    setPage,
    perPage,
    totalItems: data?.totalItems ?? 0,
    totalPages: data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
