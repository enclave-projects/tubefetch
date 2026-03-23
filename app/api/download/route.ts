import { NextResponse } from "next/server";
import { z } from "zod";
import { downloadQueue } from "@/lib/job-queue";
import { parseYoutubeTarget } from "@/lib/youtube";

export const runtime = "nodejs";

const downloadRequestSchema = z.object({
  url: z.string().trim().min(1),
  quality: z.number().int().positive().optional(), // max height, e.g. 1080
});

export async function POST(request: Request) {
  try {
    const payload = downloadRequestSchema.parse(await request.json());
    const target = parseYoutubeTarget(payload.url);

    if (!target) {
      return NextResponse.json(
        { error: "Paste a valid YouTube video or playlist URL." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const job = downloadQueue.createJob(target.normalizedUrl, target.kind, payload.quality);
    return NextResponse.json(
      { jobId: job.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request payload.";

    return NextResponse.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
