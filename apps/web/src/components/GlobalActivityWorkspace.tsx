"use client";

import { useEffect, useState } from "react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import type { ActivityRecord } from "@/types/activity";

export function GlobalActivityWorkspace() {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [message, setMessage] = useState("Loading activity...");

  useEffect(() => {
    async function loadActivity() {
      try {
        const response = await fetch("/api/activity?take=80", { cache: "no-store" });
        const data = (await response.json()) as {
          activities?: ActivityRecord[];
          error?: string;
        };

        if (!response.ok) {
          setMessage(data.error || "Unable to load activity.");
          return;
        }

        setActivities(data.activities ?? []);
        setMessage("Recent activity across Requests, Directory records, Opportunities, and Quotes.");
      } catch {
        setMessage("Unable to reach the activity service.");
      }
    }

    void loadActivity();
  }, []);

  return (
    <section className="panel global-activity-panel" aria-labelledby="global-activity-title">
      <div className="panel-header">
        <div>
          <h2 id="global-activity-title">Global Activity Timeline</h2>
          <p className="panel-note">{message}</p>
        </div>
      </div>
      <ActivityTimeline activities={activities} />
    </section>
  );
}
