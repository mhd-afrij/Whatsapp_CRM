"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchSearchBreakdown,
  fetchSearchCategory,
  type SearchCategory,
} from "@/lib/search-api";

/** Debounces a fast-changing value (keystrokes) by `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function useGlobalSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), 300);

  return useQuery({
    queryKey: ["search", "breakdown", debounced],
    queryFn: () => fetchSearchBreakdown(debounced),
    enabled: debounced.length > 0,
  });
}

export function useSearchCategoryResults(
  query: string,
  category: SearchCategory,
  page: number,
  perPage = 15
) {
  return useQuery({
    queryKey: ["search", "category", category, query, page, perPage],
    queryFn: () => fetchSearchCategory(query, category, page, perPage),
    enabled: query.trim().length > 0,
  });
}
