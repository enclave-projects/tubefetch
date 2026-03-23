import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { downloadQueue } from "@/lib/job-queue";
import { sanitizeFileName } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = downloadQueue.getJob(id);

  if (!job) {
    return NextResponse.json(
      { error: "Job not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (job.status === "expired") {
    return NextResponse.json(
      { error: "This download has expired." },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (job.status !== "completed") {
    return NextResponse.json(
      { error: "The file is not ready yet." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const targetPath = job.kind === "playlist" ? job.zipOutputPath : job.outputPath;
  if (!targetPath) {
    return NextResponse.json(
      { error: "The completed file is missing." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  await fs.access(targetPath);
  const stats = await fs.stat(targetPath);
  const defaultName = job.kind === "playlist" ? `playlist-${id}.zip` : `tube-fetch-${id}.mp4`;
  const downloadName = sanitizeFileName(job.fileName || defaultName);
  const contentType = job.kind === "playlist" ? "application/zip" : "video/mp4";
  const body = Readable.toWeb(createReadStream(targetPath)) as ReadableStream;

  return new NextResponse(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Length": stats.size.toString(),
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${downloadName}"`,
    },
  });
}
