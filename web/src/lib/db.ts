import "server-only";

import { createHash } from "node:crypto";

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL);
}

export function ownerEmail(): string {
  return (process.env.FOLIO_OWNER_EMAIL || "official@warmbeing.com").trim().toLowerCase();
}

function userIdForEmail(email: string): string {
  return `user_${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
}

export function ownerUserId(): string {
  return userIdForEmail(ownerEmail());
}

let schemaReady = false;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const sql = await database();
  const legacyOwnerId = ownerUserId();
  const legacyOwnerEmail = ownerEmail();
  const misspelledOwnerEmail = "offical@warmbeing.com";
  const misspelledOwnerId = userIdForEmail(misspelledOwnerEmail);

  await sql`
    CREATE TABLE IF NOT EXISTS folio_users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      email_verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    INSERT INTO folio_users (id, email, email_verified_at)
    VALUES (${legacyOwnerId}, ${legacyOwnerEmail}, now())
    ON CONFLICT (email) DO NOTHING
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS folio_notes (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES folio_users(id) ON DELETE CASCADE,
      content text NOT NULL DEFAULT '',
      title text,
      url text,
      selection text,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      deleted_at timestamptz
    )
  `;
  await sql`ALTER TABLE folio_notes ADD COLUMN IF NOT EXISTS user_id text REFERENCES folio_users(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE folio_notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz`;
  await sql`UPDATE folio_notes SET user_id = ${legacyOwnerId} WHERE user_id IS NULL`;
  await sql`UPDATE folio_notes SET user_id = ${legacyOwnerId} WHERE user_id = ${misspelledOwnerId}`;
  await sql`ALTER TABLE folio_notes ALTER COLUMN user_id SET NOT NULL`;
  await sql`DELETE FROM folio_users WHERE id = ${misspelledOwnerId} AND email = ${misspelledOwnerEmail}`;

  await sql`
    CREATE TABLE IF NOT EXISTS folio_sessions (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES folio_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS folio_login_tokens (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES folio_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS folio_device_codes (
      code_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES folio_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS folio_devices (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES folio_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS folio_rate_limits (
      key text PRIMARY KEY,
      count integer NOT NULL,
      expires_at timestamptz NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS folio_notes_user_updated_idx ON folio_notes (user_id, updated_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS folio_sessions_expiry_idx ON folio_sessions (expires_at)`;
  await sql`CREATE INDEX IF NOT EXISTS folio_devices_user_idx ON folio_devices (user_id)`;

  schemaReady = true;
}
