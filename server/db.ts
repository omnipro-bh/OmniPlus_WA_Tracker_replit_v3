// Database integration from blueprint
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const rawConnectionString = process.env.DATABASE_URL;

// Local/loopback Postgres runs without TLS; managed providers (e.g. the Supabase
// pooler) require TLS and present a self-signed cert, so verification must be
// relaxed to match the previous `sslmode=require` behaviour.
const isLoopback = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(rawConnectionString);

// pg's ConnectionParameters merges the parsed connection string OVER explicitly
// passed options (`Object.assign({}, config, parse(connectionString))`). An
// `sslmode=require` in the URL parses to `ssl: {}` (empty object => rejectUnauthorized
// defaults to true) and would clobber the explicit `ssl` option below, producing
// SELF_SIGNED_CERT_IN_CHAIN against the Supabase self-signed cert. Strip `sslmode`
// from the URL so the explicit `ssl` config wins.
const connectionString = rawConnectionString
  .replace(/([?&])sslmode=[^&]*&?/, '$1')
  .replace(/[?&]$/, '');

export const pool = new Pool({
  connectionString,
  ssl: isLoopback ? undefined : { rejectUnauthorized: false },
});

export const db = drizzle({ client: pool, schema });
