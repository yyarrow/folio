import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteNote } from "@/lib/store";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "笔记编号无效。" }, { status: 400 });
  }
  try {
    await deleteNote(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "暂时无法删除笔记。" }, { status: 503 });
  }
}
