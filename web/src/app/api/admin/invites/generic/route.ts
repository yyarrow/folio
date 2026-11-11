import { NextResponse } from "next/server";
import { requestT } from "@/lib/server-messages";
import { createGenericInvite, isSameOrigin, requireOwner } from "@/lib/auth";

export async function POST(request: Request) {
  const t = requestT(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: t("api.invalidOrigin") }, { status: 403 });
  }
  const owner = await requireOwner(request);
  if (owner instanceof Response) return owner;
  try {
    return NextResponse.json(await createGenericInvite());
  } catch (error) {
    console.error("generic invite failed", error);
    return NextResponse.json({ error: t("api.inviteFailed") }, { status: 503 });
  }
}
