import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import pool from "@/lib/db";

interface SessionEntry {
  token: string;
  createdAt: number;
}

declare global {
  var __tubeFetchSessions: Map<string, SessionEntry> | undefined;
}

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSessionStore(): Map<string, SessionEntry> {
  if (!globalThis.__tubeFetchSessions) {
    globalThis.__tubeFetchSessions = new Map();
  }
  return globalThis.__tubeFetchSessions;
}

function cleanExpiredSessions(): void {
  const store = getSessionStore();
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.createdAt > SESSION_MAX_AGE_MS) {
      store.delete(key);
    }
  }
}

/**
 * Create a new ephemeral session token for browser-based admin access.
 */
export function createSession(): string {
  cleanExpiredSessions();
  const sessionId = nanoid(32);
  getSessionStore().set(sessionId, { token: sessionId, createdAt: Date.now() });
  return sessionId;
}

/**
 * Verify an admin token. Checks the ADMIN_SECRET env var (for programmatic/API use)
 * and the ephemeral session store (for browser sessions).
 */
export async function verifyAdminToken(token: string): Promise<boolean> {
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret && token === adminSecret) return true;

  const store = getSessionStore();
  const session = store.get(token);
  if (session && Date.now() - session.createdAt <= SESSION_MAX_AGE_MS) {
    return true;
  }

  // Remove expired session if found
  if (session) {
    store.delete(token);
  }

  return false;
}

/**
 * Verify admin credentials (username + password) against the admin_users table.
 */
export async function verifyAdminCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const result = await pool.query(
    "SELECT password_hash FROM admin_users WHERE username = $1",
    [username],
  );
  if (result.rows.length === 0) return false;
  return bcrypt.compare(password, result.rows[0].password_hash);
}

/**
 * Create an admin user with a bcrypt-hashed password.
 */
export async function createAdminUser(
  username: string,
  password: string,
): Promise<void> {
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    "INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING",
    [username, hash],
  );
}

/**
 * Extract and validate the Bearer token from a request's Authorization header.
 * Returns the token string or null if missing/invalid.
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
