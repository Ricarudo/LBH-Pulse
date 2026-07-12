export type GlobalSearchKind =
  | "request"
  | "client"
  | "quote"
  | "project"
  | "invoice"
  | "item";

export type GlobalSearchResult = {
  kind: GlobalSearchKind;
  id: string;
  number: string;
  title: string;
  context: string;
  status: string;
  updatedAt: string;
};

export type GlobalSearchResponse = {
  query: string;
  results: GlobalSearchResult[];
  total: number;
};

import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(2, "Enter at least 2 characters.").max(100)
});
