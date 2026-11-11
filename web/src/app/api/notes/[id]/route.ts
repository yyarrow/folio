import { NextResponse } from "next/server";
import { requestT } from "@/lib/server-messages";
import { getCurrentUser } from "@/lib/auth";
import { deleteNote } from "@/lib/store";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = requestT(request);
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: t("api.invalidNoteId") }, { status: 400 });
  }
  try {
    await deleteNote(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: t("api.deleteNoteFailed") }, { status: 503 });
  }
}
