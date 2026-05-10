import pool from "@/lib/db";

export async function recordDownload(data: {
  jobId: string;
  url: string;
  kind: string;
  quality?: number;
  ipAddress: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO download_history (job_id, url, kind, quality, ip_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [data.jobId, data.url, data.kind, data.quality ?? null, data.ipAddress],
    );
  } catch {
    // Non-critical - don't block the request if history tracking fails
  }
}

export async function updateDownloadStatus(
  jobId: string,
  status: string,
  title?: string,
  fileSizeBytes?: number,
): Promise<void> {
  const completedAt =
    status === "completed" || status === "failed" ? new Date() : null;

  await pool.query(
    `UPDATE download_history
     SET status = $1, title = $2, file_size_bytes = $3, completed_at = $4
     WHERE job_id = $5`,
    [status, title ?? null, fileSizeBytes ?? null, completedAt, jobId],
  );
}

export async function getDownloadHistory(
  page: number,
  limit: number,
  filters?: { status?: string; ip?: string },
): Promise<{ rows: unknown[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }

  if (filters?.ip) {
    conditions.push(`ip_address = $${paramIndex}`);
    params.push(filters.ip);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM download_history ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const offset = (page - 1) * limit;
  const dataParams = [...params, limit, offset];
  const rows = await pool.query(
    `SELECT * FROM download_history ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    dataParams,
  );

  return { rows: rows.rows, total };
}

export async function getDownloadStats(): Promise<{
  totalDownloads: number;
  downloadsToday: number;
  totalBlockedIps: number;
}> {
  const totalResult = await pool.query(
    "SELECT COUNT(*) as count FROM download_history",
  );
  const todayResult = await pool.query(
    "SELECT COUNT(*) as count FROM download_history WHERE created_at >= CURRENT_DATE",
  );
  const blockedResult = await pool.query(
    "SELECT COUNT(*) as count FROM blocked_ips",
  );

  return {
    totalDownloads: parseInt(totalResult.rows[0].count, 10),
    downloadsToday: parseInt(todayResult.rows[0].count, 10),
    totalBlockedIps: parseInt(blockedResult.rows[0].count, 10),
  };
}
