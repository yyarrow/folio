import { NextResponse } from "next/server";
import { requestT } from "@/lib/server-messages";
import { getCurrentUser } from "@/lib/auth";
import { listNotes, upsertNote } from "@/lib/store";
import { parseNote } from "@/lib/validation";

export async function GET(request: Request) {
  const t = requestT(request);
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ notes: await listNotes(user.id) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: t("api.storageNotConfigured") }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const t = requestT(request);
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const note = parseNote(await request.json().catch(() => null));
  if (!note) {
    return NextResponse.json({ error: t("api.invalidNote") }, { status: 400 });
  }
  try {
    await upsertNote(user.id, note);
    return NextResponse.json({ note });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: t("api.saveFailed") }, { status: 503 });
  }
}
