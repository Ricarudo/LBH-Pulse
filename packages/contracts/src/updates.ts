import { z } from "zod";

export const updateApplySchema = z.object({
  releaseId: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/)
}).strict();
export type UpdateApplyInput = z.infer<typeof updateApplySchema>;
export type UpdateStage = "queued" | "preflight" | "downloading" | "maintenance" | "backup" | "restore-verification" | "migrating" | "starting" | "verifying" | "updater-handoff" | "succeeded" | "failed" | "recovery-required" | "recovered";
export type UpdateJob = {
  id: string; releaseId: string; actor: { id: string; name: string }; stage: UpdateStage;
  createdAt: string; updatedAt: string; error: string | null; recoveryRequired: boolean; backupVerified: boolean;
  events: { at: string; stage: UpdateStage }[];
};
export type UpdateStatus = {
  managed: boolean; installedVersion: string | null; availableVersion: string | null;
  releaseNotes: string; channel: "stable"; backupReady: boolean; lastCheckedAt: string | null;
  error: string | null; eligible: boolean; reason: string | null;
  job: UpdateJob | null; history: UpdateJob[];
};
export type UpdateApplyResponse = { job: UpdateJob; statusToken: string };
export const updateStageLabels: Record<UpdateStage, string> = {
  queued: "Preparing update", preflight: "Checking installation", downloading: "Downloading release",
  maintenance: "Entering maintenance", backup: "Creating encrypted backup", "restore-verification": "Verifying backup recovery",
  migrating: "Updating database", starting: "Starting Pulse", verifying: "Verifying Pulse",
  "updater-handoff": "Updating management service", succeeded: "Update complete", failed: "Update stopped safely",
  "recovery-required": "Operator recovery required", recovered: "Previous release restored"
};
