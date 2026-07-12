"use client";

import { usePulseAuth } from "@/components/PulseShell";

export function useCurrentUser() {
  return usePulseAuth();
}
