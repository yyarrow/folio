export function extensionCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && (
    origin === "https://folio.warmbeing.com"
    || origin.startsWith("chrome-extension://")
    || origin.startsWith("moz-extension://")
    || origin.startsWith("http://localhost:")
  ) ? origin : undefined;

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}
