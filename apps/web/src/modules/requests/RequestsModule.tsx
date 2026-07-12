"use client";

import { RequestsQueueModule } from "./RequestsQueueModule";

/**
 * Compatibility export for older request entry points. The queue module is
 * now the single request list/work surface so legacy routes cannot resurrect
 * separate task or next-action controls.
 */
export function RequestsModule({ openNewOnLoad = false }: { openNewOnLoad?: boolean }) {
  return <RequestsQueueModule openNewOnLoad={openNewOnLoad} />;
}
