import { NextResponse } from "next/server";
import { z } from "zod";
import { downloadQueue } from "@/lib/job-queue";
import { parseYoutubeTarget } from "@/lib/youtube";
import { withSecurity } from "@/lib/middleware";
import { recordDownload } from "@/lib/download-history";
import { getClientIp } from "@/lib/security";

export const runtime = "nodejs";

const downloadRequestSchema = z.object({
  url: z.string().trim().min(1),
  quality: z.number().int().positive().optional(), // max height, e.g. 1080
});

export const POST = withSecurity(
  async (request: Request) => {
    try {
      const payload = downloadRequestSchema.parse(await request.json());

      // URL length validation
      if (payload.url.length > 2048) {
        return NextResponse.json(
          { error: "URL is too long." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      const target = parseYoutubeTarget(payload.url);

      if (!target) {
        return NextResponse.json(
          { error: "Paste a valid YouTube video or playlist URL." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      const job = downloadQueue.createJob(
        target.normalizedUrl,
        target.kind,
        payload.quality,
      );

      // Record download in history
      const ip = getClientIp(request);
      await recordDownload({
        jobId: job.id,
        url: target.normalizedUrl,
        kind: target.kind,
        quality: payload.quality,
        ipAddress: ip,
      });

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
  },
  { maxRequests: 10, windowMs: 60000 },
);
