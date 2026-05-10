import { Pool } from "pg";

declare global {
  var __tubeFetchDb: Pool | undefined;
}

const pool =
  globalThis.__tubeFetchDb ??
  (globalThis.__tubeFetchDb = new Pool({
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
  }));

export default pool;
