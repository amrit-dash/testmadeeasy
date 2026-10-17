import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

let databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    "[startup] DATABASE_URL or SUPABASE_DATABASE_URL is not set. Database operations will fail until configured.",
  );
}

// Fix for Supabase "MaxClientsInSessionMode" error:
// If using Supabase session pooler (port 5432), change it to transaction pooler (port 6543)
if (databaseUrl && (databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.supabase.com'))) {
  if (databaseUrl.includes(':5432')) {
    databaseUrl = databaseUrl.replace(':5432', ':6543');
    if (!databaseUrl.includes('pgbouncer=true')) {
      databaseUrl += (databaseUrl.includes('?') ? '&' : '?') + 'pgbouncer=true';
    }
  }
}

export const pool = new Pool({
  connectionString: databaseUrl ?? "postgresql://127.0.0.1:1/unconfigured",
  max: process.env.DB_POOL_SIZE ? parseInt(process.env.DB_POOL_SIZE) : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});
pool.on('error', (err: any, client) => {
  if (err.code === 'EADDRNOTAVAIL') {
    console.warn('Postgres pool: Idle client dropped (EADDRNOTAVAIL - expected with poolers)');
  } else if (err.message?.includes('Connection terminated unexpectedly')) {
    console.warn('Postgres pool: Connection terminated unexpectedly');
  } else {
    console.error('Unexpected error on idle client', err?.message?.includes("TIMEDOUT") || String(err).includes("TIMEDOUT") ? "" : err);
  }
});

export const db = drizzle(pool, { schema });
