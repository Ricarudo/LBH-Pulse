import { readFileSync } from "node:fs";
import type { NextFunction, Request, Response } from "express";

export function inMaintenance(file = process.env.PULSE_MAINTENANCE_FILE): boolean {
  if (!file) return false;
  try { return JSON.parse(readFileSync(file, "utf8")).maintenance !== false; }
  catch { return true; } // Managed installations fail closed after a reboot or lost state volume.
}
export function maintenanceMiddleware(request: Request, response: Response, next: NextFunction) {
  if (/^\/api\/health(?:\/(?:live|ready|database))?$/.test(request.path) || !inMaintenance()) { next(); return; }
  response.setHeader("Retry-After", "10");
  response.status(503).json({ error: "Pulse is in maintenance mode. Please reconnect shortly.", code: "PULSE_MAINTENANCE" });
}
