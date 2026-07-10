import type {
  ConvertRequestInput,
  RequestRecord
} from "@pulse/contracts/requests";
import { apiRequest } from "@/lib/api/client";

export type RequestResponse = { request: RequestRecord };

export function convertRequestToQuote(
  requestId: string,
  input: ConvertRequestInput
) {
  return apiRequest<RequestResponse>(
    `/api/requests/${encodeURIComponent(requestId)}/convert`,
    {
      method: "POST",
      json: input
    }
  );
}
