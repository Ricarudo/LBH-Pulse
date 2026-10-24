import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request } from "express";
import { HttpException } from "@nestjs/common";
import { UpdatesController } from "@/controllers/updates.controller";
import { AuthService } from "@/shared/auth.service";
import { inMaintenance } from "@/shared/maintenance";
import { updaterRequest, updateStatus } from "@/lib/services/updateService";
import { updateApplySchema } from "@pulse/contracts/updates";
import { effectiveRolePermissions } from "@/lib/services/roleAccessService";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.PULSE_UPDATER_URL;
const originalToken = process.env.PULSE_UPDATER_TOKEN_FILE;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.PULSE_UPDATER_URL; else process.env.PULSE_UPDATER_URL = originalUrl;
  if (originalToken === undefined) delete process.env.PULSE_UPDATER_TOKEN_FILE; else process.env.PULSE_UPDATER_TOKEN_FILE = originalToken;
});
test("managed maintenance fails closed on missing or malformed durable state",() => {
  const root = mkdtempSync(join(tmpdir(),"pulse-maintenance-"));
  try {
    const file = join(root,"state.json"); assert.equal(inMaintenance(file),true);
    writeFileSync(file,"{"); assert.equal(inMaintenance(file),true);
    writeFileSync(file,JSON.stringify({maintenance:true})); assert.equal(inMaintenance(file),true);
    writeFileSync(file,JSON.stringify({maintenance:false})); assert.equal(inMaintenance(file),false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test("unmanaged installations expose status without enabling Docker control",async () => {
  delete process.env.PULSE_UPDATER_URL;
  const status = await updateStatus(); assert.equal(status.managed,false); assert.equal(status.eligible,false);
});
test("custom roles cannot acquire the protected update-apply capability",() => {
  const permissions = effectiveRolePermissions({systemKey:null,protected:false,permissions:[{permission:"system:updates:apply"},{permission:"system:updates:read"}]});
  assert.equal(permissions.includes("system:updates:apply"),false); assert.equal(permissions.includes("system:updates:read"),true);
  assert.ok(effectiveRolePermissions({systemKey:"ADMIN",protected:true,permissions:[]}).includes("system:updates:apply"));
});
test("apply rejects non-admins even if a malformed role claims update permission",async () => {
  const auth = {requireUser:async () => ({isSystemAdmin:false})} as unknown as AuthService;
  await assert.rejects(new UpdatesController(auth).apply({} as Request,{releaseId:"0.2.0",idempotencyKey:"test-request-key-123"}),/Administrator/);
});
test("update endpoints require their specific server-side permissions",async () => {
  const required: unknown[] = [];
  const auth = {requireUser:async (_request:unknown, permission:unknown) => { required.push(permission); throw new Error("denied"); }} as unknown as AuthService;
  const controller = new UpdatesController(auth);
  for (const action of [() => controller.status({} as Request),() => controller.check({} as Request),() => controller.job({} as Request,"id"),() => controller.apply({} as Request,{})]) await assert.rejects(action,/denied/);
  assert.deepEqual(required,["system:updates:read","system:updates:read","system:updates:read","system:updates:apply"]);
});
test("apply contract accepts identifiers only, never executable configuration",() => {
  const input = {releaseId:"0.2.0",idempotencyKey:"test-request-key-123"};
  assert.ok(updateApplySchema.safeParse(input).success);
  for (const extra of [{command:"id"},{image:"attacker/image"},{localRelease:true},{compose:"services: {}"}]) assert.equal(updateApplySchema.safeParse({...input,...extra}).success,false);
});
test("updater transport uses deployment credentials and hides raw errors",async () => {
  const root = mkdtempSync(join(tmpdir(),"pulse-updater-auth-"));
  try {
    const token = join(root,"token"); writeFileSync(token,"test-only-transport-token");
    process.env.PULSE_UPDATER_URL = "http://updater.invalid:9050"; process.env.PULSE_UPDATER_TOKEN_FILE = token;
    globalThis.fetch = (async (_url,options) => {
      assert.equal((options?.headers as Record<string,string>).Authorization,"Bearer test-only-transport-token");
      assert.equal(options?.redirect,"error");
      throw new Error("database-secret=never-echo-this");
    }) as typeof fetch;
    await assert.rejects(updaterRequest("/updates"),(error: unknown) => error instanceof HttpException && error.getStatus() === 503 && !JSON.stringify(error.getResponse()).includes("never-echo-this") && JSON.stringify(error.getResponse()).includes("temporarily unavailable"));
  } finally { rmSync(root,{recursive:true,force:true}); }
});
