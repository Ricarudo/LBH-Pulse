import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const keyLength = 64;

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const key = scryptSync(password, salt, keyLength).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedKey] = passwordHash.split(":");

  if (!salt || !storedKey) {
    return false;
  }

  const candidate = scryptSync(password, salt, keyLength);
  const stored = Buffer.from(storedKey, "hex");

  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
