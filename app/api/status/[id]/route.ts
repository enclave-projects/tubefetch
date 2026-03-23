import { NextResponse } from "next/server";
import { downloadQueue } from "@/lib/job-queue";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
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
}
