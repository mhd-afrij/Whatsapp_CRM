import { apiClient, unwrap } from "@/lib/api-client";

export type SearchCategory = "contacts" | "conversations" | "deals" | "tasks";

export interface SearchResultItem {
  id: number;
  [key: string]: unknown;
}

export interface SearchCategoryResult {
  items: SearchResultItem[];
  total: number;
}

export interface SearchBreakdown {
  query: string;
  categories: Partial<Record<SearchCategory, SearchCategoryResult>>;
}

export interface SearchCategoryPage {
  query: string;
  category: SearchCategory;
  items: SearchResultItem[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}

/** Omnibar mode: up to 5 results per permitted category plus each category's total. */
export async function fetchSearchBreakdown(q: string): Promise<SearchBreakdown> {
  return unwrap(apiClient.get("/search", { params: { q } }));
}

/** "View all results" mode: one category, fully paginated. */
export async function fetchSearchCategory(
  q: string,
  category: SearchCategory,
  page = 1,
  perPage = 15
): Promise<SearchCategoryPage> {
  const { data } = await apiClient.get("/search", {
    params: { q, category, page, per_page: perPage },
  });
  // Backend omits `success` on 2xx bodies — only an explicit false is a failure.
  const envelope = data as { success?: boolean; message?: string; data?: SearchCategoryPage; meta?: SearchCategoryPage["meta"] };
  if (envelope.success === false || !envelope.data) {
    throw new Error(envelope.message ?? "Search failed");
  }
  return { ...envelope.data, meta: envelope.meta ?? envelope.data.meta };
}

export const SEARCH_CATEGORY_LABELS: Record<SearchCategory, string> = {
  contacts: "Contacts",
  conversations: "Conversations",
  deals: "Deals",
  tasks: "Tasks",
};
