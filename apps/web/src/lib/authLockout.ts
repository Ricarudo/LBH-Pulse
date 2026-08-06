export function formatLockoutDuration(seconds: number) {
  const remaining = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(remaining / 60);
  const remainder = remaining % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function lockoutMessage(seconds: number) {
  return `Sign-in is temporarily locked. Try again in ${formatLockoutDuration(seconds)}.`;
}

export function retryAfterSeconds(payloadValue: unknown, headerValue: string | null) {
  const payloadSeconds = typeof payloadValue === "number" ? payloadValue : Number.NaN;
  const headerSeconds = headerValue === null ? Number.NaN : Number(headerValue);
  const seconds = Number.isFinite(payloadSeconds) ? payloadSeconds : headerSeconds;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
}
