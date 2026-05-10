import { NextResponse } from "next/server";
import { getClientIp, isIpBlocked, checkRateLimit } from "@/lib/security";

export interface SecurityOptions {
  maxRequests?: number; // default 60
  windowMs?: number; // default 60000 (1 minute)
  endpoint?: string; // auto-derived from request URL if not provided
}

export function withSecurity(
  handler: (request: Request, context?: unknown) => Promise<NextResponse>,
  options?: SecurityOptions,
): (request: Request, context?: unknown) => Promise<NextResponse> {
  const maxRequests = options?.maxRequests ?? 60;
  const windowMs = options?.windowMs ?? 60000;

  return async (request: Request, context?: unknown): Promise<NextResponse> => {
    const ip = getClientIp(request);

    // Check IP block list
    const blocked = await isIpBlocked(ip);
    if (blocked) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Determine endpoint
    const endpoint =
      options?.endpoint ?? new URL(request.url).pathname;

    // Check rate limit
    const rateResult = await checkRateLimit(ip, endpoint, maxRequests, windowMs);
    if (!rateResult.allowed) {
      const retryAfter = Math.ceil(
        (rateResult.resetAt.getTime() - Date.now()) / 1000,
      );
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(Math.max(retryAfter, 1)),
          },
        },
      );
    }

    // Call the original handler
    const response = await handler(request, context);

    // Add security headers
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");

    return response;
  };
}
