"use client";

import { Activity, Clock3, UserRound } from "lucide-react";
import type { ActivityRecord } from "@/types/activity";
import { formatWorkspaceDate } from "@/lib/formatting";

type ActivityTimelineProps = {
  activities: ActivityRecord[];
  emptyMessage?: string;
};

export function ActivityTimeline({
  activities,
  emptyMessage = "No activity has been recorded yet."
}: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="activity-empty-state">
        <Activity size={18} />
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="global-activity-list">
      {activities.map((item) => (
        <article key={item.id} className="global-activity-item">
          <div className="global-activity-icon">
            <Activity size={16} />
          </div>
          <div>
            <div className="global-activity-heading">
              <strong>{item.title}</strong>
              <span>{item.relatedEntityType}</span>
            </div>
            {item.detail ? <p>{item.detail}</p> : null}
            <div className="global-activity-meta">
              <span>
                <UserRound size={13} />
                {item.actorName} ({item.actorRole})
              </span>
              <span>
                <Clock3 size={13} />
                {formatWorkspaceDate(item.createdAt, true)}
              </span>
              <span>{item.type}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
