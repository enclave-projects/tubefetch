import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { downloadQueue } from "@/lib/job-queue";
import { sanitizeFileName } from "@/lib/utils";
import { withSecurity } from "@/lib/middleware";
import { validatePathWithinRoot } from "@/lib/paths";

export const runtime = "nodejs";

export const GET = withSecurity(
  async (
    _request: Request,
    context?: unknown,
  ) => {
    const { id, itemId } = await (context as { params: Promise<{ id: string; itemId: string }> }).params;
    const job = downloadQueue.getJob(id);

    if (!job || job.kind !== "playlist") {
      return NextResponse.json(
        { error: "Playlist job not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (job.status === "expired") {
      return NextResponse.json(
        { error: "This playlist has expired." },
        { status: 410, headers: { "Cache-Control": "no-store" } },
      );
    }

    const item = job.items?.find((entry) => entry.id === itemId);
    if (!item || item.status !== "completed" || !item.outputPath) {
      return NextResponse.json(
        { error: "This playlist item is not ready." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Validate path stays within downloads root
    try {
      validatePathWithinRoot(item.outputPath);
    } catch {
      return NextResponse.json(
        { error: "Invalid file path." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    await fs.access(item.outputPath);
    const stats = await fs.stat(item.outputPath);
    const downloadName = sanitizeFileName(
      item.fileName || `playlist-item-${item.index + 1}.mp4`,
    );
    const body = Readable.toWeb(createReadStream(item.outputPath)) as ReadableStream;

    return new NextResponse(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Length": stats.size.toString(),
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
      },
    });
  },
  { maxRequests: 30, windowMs: 60000 },
);
