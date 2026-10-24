import { readFileSync } from "node:fs";
import { HttpException } from "@nestjs/common";
import type { UpdateStatus } from "@pulse/contracts/updates";

export const unmanagedUpdateStatus: UpdateStatus = {
  managed: false, installedVersion: null, availableVersion: null, releaseNotes: "", channel: "stable", backupReady: false,
  lastCheckedAt: null, error: null, eligible: false, reason: "MANAGED_INSTALLATION_REQUIRED", job: null, history: []
};
export async function updaterRequest<T>(path: string, payload?: unknown): Promise<T> {
  const url = process.env.PULSE_UPDATER_URL;
  const tokenFile = process.env.PULSE_UPDATER_TOKEN_FILE;
  if (!url || !tokenFile) throw new HttpException({ error: "This installation is not managed by the Pulse updater." }, 503);
  // The origin and credential come only from deployment configuration.
  try {
    const token = readFileSync(tokenFile, "utf8").trim();
    const response = await fetch(new URL(path, url), {
      method: payload === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(35_000), redirect: "error"
    });
    const data = await response.json() as { error?: unknown };
    if (!response.ok) throw new HttpException({ error: "The updater could not accept this operation.", code: typeof data.error === "string" && /^[A-Z_]+$/.test(data.error) ? data.error : "UPDATER_UNAVAILABLE" }, response.status === 409 ? 409 : 503);
    return data as T;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException({ error: "The update service is temporarily unavailable. Pulse remains available." }, 503);
  }
}
export async function updateStatus(): Promise<UpdateStatus> {
  if (!process.env.PULSE_UPDATER_URL) return unmanagedUpdateStatus;
  return updaterRequest<UpdateStatus>("/updates");
}
