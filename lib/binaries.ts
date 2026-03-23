import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function tryResolveFfmpegStatic() {
  const bundledBinary = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
  );

  if (fs.existsSync(bundledBinary)) {
    return bundledBinary;
  }

  try {
    const resolved = require("ffmpeg-static") as string | null;
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveYtDlpBinary() {
  return process.env.YT_DLP_PATH?.trim() || "yt-dlp";
}

export function resolveFfmpegBinary() {
  const configured = process.env.FFMPEG_PATH?.trim();
  if (configured) {
    return configured;
  }

  const packaged = tryResolveFfmpegStatic();
  if (packaged) {
    return packaged;
  }

  const scoopBinary = path.join(
    process.env.USERPROFILE || "",
    "scoop",
    "apps",
    "ffmpeg",
    "current",
    "bin",
    "ffmpeg.exe",
  );

  if (fs.existsSync(scoopBinary)) {
    return scoopBinary;
  }

  return "ffmpeg";
}

export function resolveJsRuntimeOption() {
  const nodePath = process.execPath?.trim();
  return nodePath ? `node:${nodePath}` : null;
}
