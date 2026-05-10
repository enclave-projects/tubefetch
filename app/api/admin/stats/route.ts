import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/middleware";
import { extractBearerToken, verifyAdminToken } from "@/lib/admin-auth";
import { getDownloadStats } from "@/lib/download-history";

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

    const stats = await getDownloadStats();
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "no-store" },
    });
  },
  { maxRequests: 30, windowMs: 60000 },
);
