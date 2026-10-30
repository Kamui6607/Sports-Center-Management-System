import { createHash } from "crypto";

/**
 * BR-27: Hash a refresh token before storing in DB.
 * Uses SHA-256 (fast, deterministic — no salt needed since tokens are already high-entropy JWTs).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
