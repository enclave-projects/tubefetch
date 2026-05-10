import bcrypt from "bcryptjs";
import pool from "@/lib/db";

/**
 * Verify an admin token. First checks against the ADMIN_SECRET env var,
 * then could be extended to check stored tokens.
 */
export async function verifyAdminToken(token: string): Promise<boolean> {
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret && token === adminSecret) return true;
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
