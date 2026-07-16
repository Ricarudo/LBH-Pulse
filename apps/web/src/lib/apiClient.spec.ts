import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiClientError,
  apiRequest
} from "@/lib/api/client";
import { fetchItems } from "@/lib/api/items";
import { convertRequestToQuote } from "@/lib/api/requests";

test("api client sends authenticated JSON requests and parses the response", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = { input, init };
    return new Response(JSON.stringify({ item: { id: "item-1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const result = await apiRequest<{ item: { id: string } }>("/api/items", {
      method: "POST",
      json: { name: "Switch" }
    });

    assert.equal(result.item.id, "item-1");
    assert.equal(captured?.input, "/api/items");
    assert.equal(captured?.init?.credentials, "same-origin");
    assert.equal(new Headers(captured?.init?.headers).get("Content-Type"), "application/json");
    assert.equal(captured?.init?.body, JSON.stringify({ name: "Switch" }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api client preserves FormData content type handling", async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Headers | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const body = new FormData();
    body.set("file", new Blob(["file"]), "sample.txt");
    await apiRequest<{ ok: boolean }>("/api/documents", {
      method: "POST",
      body
    });

    assert.equal(capturedHeaders?.has("Content-Type"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api client exposes status and field errors from failed responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: "Validation failed.",
        fields: { name: "Item name is required." },
        issues: [{ path: ["name"] }]
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  try {
    await assert.rejects(
      apiRequest("/api/items", { method: "POST", json: {} }),
      (error: unknown) => {
        assert.equal(error instanceof ApiClientError, true);
        if (!(error instanceof ApiClientError)) return false;
        assert.equal(error.message, "Validation failed.");
        assert.equal(error.status, 400);
        assert.equal(error.fields?.name, "Item name is required.");
        assert.deepEqual(error.issues, [{ path: ["name"] }]);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("domain clients target the NestJS API and encode payloads", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify(calls.length === 1 ? { items: [] } : { request: {} }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    await fetchItems({ q: "PoE switch", includeInactive: true });
    await convertRequestToQuote("request/1", {
      createQuote: true,
      calculationMode: "PULSE"
    });

    assert.equal(
      calls[0]?.input,
      "/api/items?q=PoE+switch&includeInactive=true"
    );
    assert.equal(calls[0]?.init?.method, "GET");
    assert.equal(calls[1]?.input, "/api/requests/request%2F1/convert");
    assert.equal(calls[1]?.init?.method, "POST");
    assert.equal(
      calls[1]?.init?.body,
      JSON.stringify({ createQuote: true, calculationMode: "PULSE" })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
