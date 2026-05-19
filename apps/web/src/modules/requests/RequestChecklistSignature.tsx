import type { RequestChecklistItem } from "./requestData";

function initialsFor(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "PU";
}

export function RequestChecklistSignature({
  item,
  compact = false
}: {
  item: RequestChecklistItem;
  compact?: boolean;
}) {
  if (!item.completed || !item.completedByName || !item.completedAt) {
    return null;
  }

  return (
    <span className={compact ? "request-checklist-signature compact" : "request-checklist-signature"}>
      <span className="request-checklist-avatar">{initialsFor(item.completedByName)}</span>
      <span>{compact ? item.completedByName : `Completed by ${item.completedByName}`}</span>
      <span>{item.completedAt}</span>
    </span>
  );
}
