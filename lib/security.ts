import pool from "@/lib/db";

/**
 * Extract client IP from request headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}

/**
 * Check if an IP is in the block list.
 */
export async function isIpBlocked(ip: string): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT 1 FROM blocked_ips WHERE ip_address = $1 LIMIT 1",
      [ip],
    );
    return result.rowCount !== null && result.rowCount > 0;
  } catch {
    // Degrade gracefully - allow request if DB is unreachable
    return false;
  }
}

/**
 * Block an IP address.
 */
export async function blockIp(ip: string, reason?: string): Promise<void> {
  await pool.query(
    "INSERT INTO blocked_ips (ip_address, reason) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [ip, reason ?? null],
  );
}

/**
 * Remove an IP from the block list.
 */
export async function unblockIp(ip: string): Promise<void> {
  await pool.query("DELETE FROM blocked_ips WHERE ip_address = $1", [ip]);
}

/**
 * Get all blocked IPs.
 */
export async function getBlockedIps(): Promise<
  Array<{ ip_address: string; reason: string | null; blocked_at: string }>
> {
  const result = await pool.query(
    "SELECT ip_address, reason, blocked_at FROM blocked_ips ORDER BY blocked_at DESC",
  );
  return result.rows;
}

/**
 * Check rate limit for a given IP and endpoint.
 */
export async function checkRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    // Try to get existing record
    const existing = await pool.query(
      "SELECT request_count, window_start FROM rate_limits WHERE ip_address = $1 AND endpoint = $2",
      [ip, endpoint],
    );

    if (existing.rowCount === 0 || existing.rows.length === 0) {
      // No record - insert new one
      await pool.query(
        `INSERT INTO rate_limits (ip_address, endpoint, request_count, window_start)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (ip_address, endpoint)
         DO UPDATE SET request_count = 1, window_start = NOW()`,
        [ip, endpoint],
      );
      const resetAt = new Date(now.getTime() + windowMs);
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    const row = existing.rows[0];
    const rowWindowStart = new Date(row.window_start);

    if (rowWindowStart < windowStart) {
      // Window expired - reset
      await pool.query(
        `UPDATE rate_limits SET request_count = 1, window_start = NOW()
         WHERE ip_address = $1 AND endpoint = $2`,
        [ip, endpoint],
      );
      const resetAt = new Date(now.getTime() + windowMs);
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    // Within window
    const currentCount = row.request_count as number;
    if (currentCount >= maxRequests) {
      const resetAt = new Date(rowWindowStart.getTime() + windowMs);
      return { allowed: false, remaining: 0, resetAt };
    }

    // Increment
    await pool.query(
      `UPDATE rate_limits SET request_count = request_count + 1
       WHERE ip_address = $1 AND endpoint = $2`,
      [ip, endpoint],
    );
    const resetAt = new Date(rowWindowStart.getTime() + windowMs);
    return { allowed: true, remaining: maxRequests - 1 - currentCount, resetAt };
  } catch {
    // Degrade gracefully - allow request if DB is unreachable
    return { allowed: true, remaining: maxRequests, resetAt: new Date(Date.now() + windowMs) };
  }
}
