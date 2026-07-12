import type {
  CreateItemInput,
  ItemDetailResponse,
  ItemResponse,
  ItemSearchInput,
  ItemsResponse,
  UpdateItemInput
} from "@pulse/contracts/items";
import { apiRequest, type ApiRequestOptions } from "@/lib/api/client";

export type ItemSearchParams = Partial<ItemSearchInput>;

type ReadOptions = Pick<ApiRequestOptions, "cache" | "signal">;

function itemSearchPath(path: string, input: ItemSearchParams) {
  const query = new URLSearchParams();

  if (input.q) query.set("q", input.q);
  if (input.type) query.set("type", input.type);
  if (input.status) query.set("status", input.status);
  if (input.includeInactive !== undefined) {
    query.set("includeInactive", String(input.includeInactive));
  }

  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function fetchItems(
  input: ItemSearchParams = {},
  options: ReadOptions = {}
) {
  return apiRequest<ItemsResponse>(itemSearchPath("/api/items", input), {
    ...options,
    method: "GET"
  });
}

export function searchItems(
  input: ItemSearchParams = {},
  options: ReadOptions = {}
) {
  return apiRequest<ItemsResponse>(itemSearchPath("/api/items/search", input), {
    ...options,
    method: "GET"
  });
}

export function fetchItem(itemId: string, options: ReadOptions = {}) {
  return apiRequest<ItemResponse>(`/api/items/${encodeURIComponent(itemId)}`, {
    ...options,
    method: "GET"
  });
}

export function fetchItemDetail(itemId: string, options: ReadOptions = {}) {
  return apiRequest<ItemDetailResponse>(
    `/api/items/${encodeURIComponent(itemId)}/detail`,
    {
      ...options,
      method: "GET"
    }
  );
}

export function createItem(input: CreateItemInput) {
  return apiRequest<ItemResponse>("/api/items", {
    method: "POST",
    json: input
  });
}

export function updateItem(itemId: string, input: UpdateItemInput) {
  return apiRequest<ItemResponse>(`/api/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    json: input
  });
}

export function deactivateItem(itemId: string) {
  return apiRequest<ItemResponse>(`/api/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE"
  });
}
