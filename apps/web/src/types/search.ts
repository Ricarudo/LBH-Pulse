export type GlobalSearchKind =
  | "request"
  | "client"
  | "quote"
  | "project"
  | "invoice";

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
