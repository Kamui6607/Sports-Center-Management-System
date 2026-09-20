import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api";
import type { RecordData } from "../../shared/api";
export function useReceptionList(
  operation: string,
  query: Record<string, string> = {},
  params: Record<string, string> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ["reception", operation, query, params],
    queryFn: ({ signal }) =>
      api<RecordData[]>(operation, { query, params, signal }),
    enabled,
  });
}
export function useReceptionDetail(
  operation: string,
  params: Record<string, string>,
  enabled = true,
) {
  return useQuery({
    queryKey: ["reception", operation, params],
    queryFn: ({ signal }) => api(operation, { params, signal }),
    enabled,
  });
}
