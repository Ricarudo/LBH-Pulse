"use client";

import { useEffect, useState } from "react";
import type { AuthenticatedUser } from "@/lib/auth/permissions";

export function useCurrentUser() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = (await response.json()) as { user: AuthenticatedUser | null };
        setUser(response.ok ? data.user ?? null : null);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    void loadUser();
  }, []);

  return { user, isLoading };
}
