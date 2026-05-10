import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/middleware";
import { extractBearerToken, verifyAdminToken } from "@/lib/admin-auth";
import { getDownloadHistory } from "@/lib/download-history";

export const runtime = "nodejs";

export const GET = withSecurity(
  async (request: Request) => {
    const token = extractBearerToken(request);
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const status = url.searchParams.get("status") || undefined;
    const ip = url.searchParams.get("ip") || undefined;

    const result = await getDownloadHistory(page, limit, { status, ip });

    return NextResponse.json(
      { rows: result.rows, total: result.total, page, limit },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  { maxRequests: 30, windowMs: 60000 },
);
