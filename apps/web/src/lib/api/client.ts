export type ApiErrorPayload = {
  error?: string;
  detail?: string;
  fields?: Record<string, string>;
  issues?: unknown[];
  [key: string]: unknown;
};

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | null;
  json?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorPayload(value: unknown): ApiErrorPayload {
  if (!isRecord(value)) {
    return {};
  }

  return {
    ...value,
    error: typeof value.error === "string" ? value.error : undefined,
    detail: typeof value.detail === "string" ? value.detail : undefined,
    fields:
      isRecord(value.fields) &&
      Object.values(value.fields).every((field) => typeof field === "string")
        ? (value.fields as Record<string, string>)
        : undefined,
    issues: Array.isArray(value.issues) ? value.issues : undefined
  };
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return { error: text };
    }
    throw new ApiClientError(
      "The server returned an invalid response.",
      response.status,
      { detail: text }
    );
  }
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload;
  readonly fields?: Record<string, string>;
  readonly issues?: unknown[];

  constructor(message: string, status: number, payload: ApiErrorPayload = {}) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
    this.fields = payload.fields;
    this.issues = payload.issues;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { json, headers: initialHeaders, ...requestOptions } = options;
  const headers = new Headers(initialHeaders);
  let body = requestOptions.body;

  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }

  const response = await fetch(path, {
    ...requestOptions,
    body,
    credentials: requestOptions.credentials ?? "same-origin",
    headers
  });
  const parsed = await responsePayload(response);

  if (!response.ok) {
    const payload = errorPayload(parsed);
    throw new ApiClientError(
      payload.error || "Request failed.",
      response.status,
      payload
    );
  }

  return parsed as T;
}
