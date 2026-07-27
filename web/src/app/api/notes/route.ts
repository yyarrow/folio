import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { listNotes, upsertNote } from "@/lib/store";
import { parseNote } from "@/lib/validation";

export async function GET() {
  if (!await isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ notes: await listNotes() });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "云端存储尚未配置。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!await isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const note = parseNote(await request.json().catch(() => null));
  if (!note) {
    return NextResponse.json({ error: "笔记内容无效。" }, { status: 400 });
  }
  try {
    await upsertNote(note);
    return NextResponse.json({ note });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "暂时无法保存到云端。" }, { status: 503 });
  }
}
