import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listNotes, upsertNote } from "@/lib/store";
import { parseNote } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ notes: await listNotes(user.id) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "云端存储尚未配置。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const note = parseNote(await request.json().catch(() => null));
  if (!note) {
    return NextResponse.json({ error: "笔记内容无效。" }, { status: 400 });
  }
  try {
    await upsertNote(user.id, note);
    return NextResponse.json({ note });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "暂时无法保存到云端。" }, { status: 503 });
  }
}
