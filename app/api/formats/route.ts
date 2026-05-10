import { NextResponse } from "next/server";
import { resolveJsRuntimeOption, resolveYtDlpBinary } from "@/lib/binaries";
import { parseYoutubeTarget } from "@/lib/youtube";
import { spawn } from "node:child_process";
import { withSecurity } from "@/lib/middleware";

export const runtime = "nodejs";

export interface VideoFormat {
  formatId: string;
  resolution: string;   // e.g. "1920x1080"
  height: number;       // e.g. 1080
  fps: number | null;
  ext: string;
  vcodec: string;
  acodec: string;
  fileSizeBytes: number | null;
  label: string;        // e.g. "1080p", "4K"
  hasAudio: boolean;
}

export interface FormatsResponse {
  title: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  formats: VideoFormat[];
}

function heightToLabel(height: number): string {
  if (height >= 2160) return "4K";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720)  return "720p";
  if (height >= 480)  return "480p";
  if (height >= 360)  return "360p";
  return `${height}p`;
}

async function fetchFormatsJson(url: string): Promise<string> {
  const jsRuntimeOption = resolveJsRuntimeOption();
  return new Promise((resolve, reject) => {
    const child = spawn(
      resolveYtDlpBinary(),
      [
        "--dump-single-json",
        "--no-playlist",
        "--skip-download",
        ...(jsRuntimeOption ? ["--js-runtimes", jsRuntimeOption] : []),
        url,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const lines = (stderr || stdout).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        reject(new Error(lines.at(-1) ?? "yt-dlp failed to fetch formats."));
      } else {
        resolve(stdout);
      }
    });
  });
}

export const GET = withSecurity(
  async (request: Request) => {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url")?.trim();

    if (!rawUrl) {
      return NextResponse.json(
        { error: "Missing url parameter." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // URL length validation
    if (rawUrl.length > 2048) {
      return NextResponse.json(
        { error: "URL is too long." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const target = parseYoutubeTarget(rawUrl);
    if (!target || target.kind !== "video") {
      return NextResponse.json(
        { error: "Provide a valid YouTube video URL (not a playlist)." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const raw = await fetchFormatsJson(target.normalizedUrl);

      interface RawFormat {
        format_id?: string;
        width?: number;
        height?: number;
        fps?: number;
        ext?: string;
        vcodec?: string;
        acodec?: string;
        filesize?: number;
        filesize_approx?: number;
      }

      interface RawMeta {
        title?: string;
        thumbnail?: string;
        duration?: number;
        formats?: RawFormat[];
      }

      const meta = JSON.parse(raw) as RawMeta;

      const seen = new Set<number>();
      const formats: VideoFormat[] = [];

      for (const f of (meta.formats ?? [])) {
        const height = f.height ?? 0;
        if (height < 144) continue;
        if (!f.vcodec || f.vcodec === "none") continue;
        if (seen.has(height)) continue;
        seen.add(height);

        formats.push({
          formatId: f.format_id ?? "",
          resolution: f.width && f.height ? `${f.width}x${f.height}` : `${height}p`,
          height,
          fps: f.fps ? Math.round(f.fps) : null,
          ext: f.ext ?? "mp4",
          vcodec: f.vcodec ?? "",
          acodec: f.acodec ?? "none",
          fileSizeBytes: f.filesize ?? f.filesize_approx ?? null,
          label: heightToLabel(height),
          hasAudio: Boolean(f.acodec && f.acodec !== "none"),
        });
      }

      // Sort best-first
      formats.sort((a, b) => b.height - a.height);

      // Deduplicate keeping only distinct common heights
      const PREFERRED_HEIGHTS = [2160, 1440, 1080, 720, 480, 360];
      const deduped: VideoFormat[] = [];
      for (const ph of PREFERRED_HEIGHTS) {
        // find closest format at or below ph
        const match = formats.find(f => f.height <= ph && f.height > (PREFERRED_HEIGHTS[PREFERRED_HEIGHTS.indexOf(ph) + 1] ?? 0));
        if (match) deduped.push(match);
      }

      return NextResponse.json(
        {
          title: meta.title ?? "Untitled",
          thumbnail: meta.thumbnail ?? null,
          durationSeconds: meta.duration ?? null,
          formats: deduped.length > 0 ? deduped : formats.slice(0, 6),
        } satisfies FormatsResponse,
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch formats.";
      return NextResponse.json(
        { error: message },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  { maxRequests: 20, windowMs: 60000 },
);
