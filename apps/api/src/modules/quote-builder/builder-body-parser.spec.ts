import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import type { Request, Response } from "express";
import { builderBodyParser } from "./builder-body-parser";

async function parse(body: string) {
  const stream = new PassThrough();
  const request = Object.assign(stream, { headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, method: "PUT", body: undefined as unknown });
  let status = 200; let error: unknown;
  await new Promise<void>((resolve, reject) => {
    const response = { status(code: number) { status = code; return response; }, json(value: unknown) { error = value; resolve(); } };
    builderBodyParser(request as unknown as Request, response as unknown as Response, cause => cause ? reject(cause) : resolve());
    stream.end(body);
  });
  return { body: request.body, status, error };
}

test("Builder accepts large quote documents beyond the default JSON limit", async () => {
  const input = { description: "x".repeat(200_000) };
  assert.deepEqual((await parse(JSON.stringify(input))).body, input);
});
test("malformed and oversized working data receive actionable errors", async () => {
  assert.equal((await parse("{broken")).status, 400);
  const large = await parse(JSON.stringify({ text: "x".repeat(8 * 1024 * 1024) }));
  assert.equal(large.status, 413);
  assert.match((large.error as { error: string }).error, /Local edits are retained/);
});
