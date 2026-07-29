import { NextResponse } from "next/server";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    authenticated: Boolean(user),
    configured: isAuthConfigured(),
    user,
  });
}
