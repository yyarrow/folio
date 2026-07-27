import { NextResponse } from "next/server";
import { isAuthenticated, isAuthConfigured } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    authenticated: await isAuthenticated(),
    configured: isAuthConfigured(),
  });
}
