import pool from "@/lib/db";

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(45) UNIQUE NOT NULL,
      reason TEXT,
      blocked_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(45) NOT NULL,
      endpoint VARCHAR(255) NOT NULL,
      request_count INT DEFAULT 1,
      window_start TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(ip_address, endpoint)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS download_history (
      id SERIAL PRIMARY KEY,
      job_id VARCHAR(20) NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      kind VARCHAR(20),
      status VARCHAR(20),
      quality INT,
      ip_address VARCHAR(45),
      file_size_bytes BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
