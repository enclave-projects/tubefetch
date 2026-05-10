import { NextResponse } from "next/server";
import { downloadQueue } from "@/lib/job-queue";
import { withSecurity } from "@/lib/middleware";

export const runtime = "nodejs";

export const GET = withSecurity(
  async (
    _request: Request,
    context?: unknown,
  ) => {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;
    const job = downloadQueue.getJobResponse(id);

    if (!job) {
      return NextResponse.json(
        { error: "Job not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(job, {
      headers: { "Cache-Control": "no-store" },
    });
  },
  { maxRequests: 120, windowMs: 60000 },
);
