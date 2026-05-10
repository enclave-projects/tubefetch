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
 * Validate that a string is a valid IPv4 or IPv6 address.
 */
export function isValidIpAddress(ip: string): boolean {
  if (!ip || ip.length > 45) return false;

  // IPv4 check: x.x.x.x where each octet is 0-255
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = ip.match(ipv4Regex);
  if (ipv4Match) {
    return ipv4Match.slice(1).every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }

  // IPv6 check: contains colons, only hex digits and colons
  const ipv6Regex = /^[0-9a-fA-F:]+$/;
  if (ipv6Regex.test(ip) && ip.includes(":")) {
    // Must have between 2 and 7 colons (for valid IPv6)
    const colonCount = (ip.match(/:/g) || []).length;
    return colonCount >= 2 && colonCount <= 7;
  }

  return false;
}

/**
 * Check rate limit for a given IP and endpoint.
 * Uses an atomic INSERT ... ON CONFLICT DO UPDATE to eliminate TOCTOU races.
 */
export async function checkRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  try {
    const result = await pool.query(
      `INSERT INTO rate_limits (ip_address, endpoint, request_count, window_start)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (ip_address, endpoint) DO UPDATE SET
         request_count = CASE
           WHEN rate_limits.window_start < NOW() - INTERVAL '1 millisecond' * $3
           THEN 1
           ELSE rate_limits.request_count + 1
         END,
         window_start = CASE
           WHEN rate_limits.window_start < NOW() - INTERVAL '1 millisecond' * $3
           THEN NOW()
           ELSE rate_limits.window_start
         END
       RETURNING request_count, window_start`,
      [ip, endpoint, windowMs],
    );

    const row = result.rows[0];
    const requestCount = row.request_count as number;
    const windowStart = new Date(row.window_start);
    const resetAt = new Date(windowStart.getTime() + windowMs);

    if (requestCount > maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    return {
      allowed: true,
      remaining: maxRequests - requestCount,
      resetAt,
    };
  } catch {
    // Degrade gracefully - allow request if DB is unreachable
    return { allowed: true, remaining: maxRequests, resetAt: new Date(Date.now() + windowMs) };
  }
}
