export const activityEntityTypes = [
  "Request",
  "RequestChecklistTemplate",
  "Client",
  "Opportunity",
  "Quote",
  "User"
] as const;
export type ActivityEntityType = (typeof activityEntityTypes)[number];

export const activityTypes = [
  "Created",
  "Updated",
  "Status Changed",
  "Assignment Changed",
  "Note Added",
  "Quote Created",
  "Quote Updated",
  "Login",
  "Logout",
  "Permission Denied"
] as const;

export type ActivityType = (typeof activityTypes)[number] | string;

export type ActivityRecord = {
  id: string;
  relatedEntityType: ActivityEntityType | string;
  relatedEntityId: string;
  actorUserId?: string;
  actorName: string;
  actorRole: string;
  type: ActivityType;
  title: string;
  detail: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};
