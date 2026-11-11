import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { database, ensureSchema } from "@/lib/db";

export async function GET(request: Request) {
  const owner = await requireOwner(request);
  if (owner instanceof Response) return owner;
  await ensureSchema();
  const sql = await database();
  const rows = await sql`
    SELECT
      w.email,
      w.note,
      w.created_at,
      w.invited_at,
      CASE
        WHEN EXISTS (SELECT 1 FROM folio_users u WHERE u.email = w.email) THEN 'joined'
        WHEN EXISTS (
          SELECT 1 FROM folio_invites i
          WHERE i.email = w.email AND i.used_at IS NULL AND i.expires_at > now()
        ) THEN 'invited'
        ELSE 'waiting'
      END AS status
    FROM folio_waitlist w
    ORDER BY w.created_at DESC
  ` as { email: string; note: string | null; created_at: string; invited_at: string | null; status: string }[];
  return NextResponse.json({
    entries: rows.map((row) => ({
      email: row.email,
      note: row.note,
      createdAt: new Date(row.created_at).toISOString(),
      invitedAt: row.invited_at ? new Date(row.invited_at).toISOString() : null,
      status: row.status,
    })),
  });
}
