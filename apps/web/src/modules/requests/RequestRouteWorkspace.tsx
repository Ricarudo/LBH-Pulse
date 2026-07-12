"use client";

import { RequestEditWorkspace } from "./RequestEditWorkspace";
import { RequestRecordWorkspace } from "./RequestRecordWorkspace";
import { RequestsQueueModule } from "./RequestsQueueModule";

type RequestRouteMode = "new" | "view" | "edit";

/** Compatibility route adapter for the unified request workflow. */
export function RequestRouteWorkspace({
  mode,
  requestId
}: {
  mode: RequestRouteMode;
  requestId?: string;
}) {
  if (mode === "new") return <RequestsQueueModule openNewOnLoad />;
  if (!requestId) return <RequestsQueueModule />;
  if (mode === "edit") {
    return <RequestEditWorkspace requestId={requestId} returnTo="/requests" />;
  }
  return <RequestRecordWorkspace requestId={requestId} returnTo="/requests" />;
}
