import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { nanoid } from "nanoid";
import {
  resolveFfmpegBinary,
  resolveJsRuntimeOption,
  resolveYtDlpBinary,
} from "@/lib/binaries";
import {
  MAX_DOWNLOAD_BYTES,
  type DownloadJobRecord,
  type JobController,
  type PlaylistItemRecord,
} from "@/lib/download-types";
import { getJobDirectory } from "@/lib/paths";
import { sanitizeFileName } from "@/lib/utils";

interface YoutubeVideoMetadata {
  title?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  duration?: number;
}

interface YoutubePlaylistEntry {
  id?: string;
  title?: string;
  url?: string;
}

interface YoutubePlaylistMetadata {
  title?: string;
  entries?: YoutubePlaylistEntry[];
}

interface DownloadOutput {
  outputPath: string;
  fileName: string;
  fileSizeBytes: number;
}

function createCommandError(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return new Error(lines.at(-1) ?? "The downloader process failed.");
}

async function collectCommandOutput(command: string, args: string[]) {
  return await new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(command, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
    },
  );
}

async function runFfmpegCommand(args: string[]) {
  const result = await collectCommandOutput(resolveFfmpegBinary(), args);
  if (result.code !== 0) {
    throw createCommandError(result.stderr || result.stdout);
  }
}

async function fetchVideoMetadata(url: string) {
  const jsRuntimeOption = resolveJsRuntimeOption();
  const result = await collectCommandOutput(resolveYtDlpBinary(), [
    "--dump-single-json",
    "--no-playlist",
    "--skip-download",
    ...(jsRuntimeOption ? ["--js-runtimes", jsRuntimeOption] : []),
    url,
  ]);

  if (result.code !== 0) {
    throw createCommandError(result.stderr || result.stdout);
  }

  const parsed = JSON.parse(result.stdout) as YoutubeVideoMetadata;
  const resolution =
    parsed.width && parsed.height ? `${parsed.width}x${parsed.height}` : undefined;

  return {
    title: parsed.title,
    thumbnail: parsed.thumbnail,
    resolution,
    durationSeconds: parsed.duration,
  };
}

async function fetchPlaylistMetadata(url: string) {
  const jsRuntimeOption = resolveJsRuntimeOption();
  const result = await collectCommandOutput(resolveYtDlpBinary(), [
    "--dump-single-json",
    "--flat-playlist",
    "--yes-playlist",
    "--skip-download",
    ...(jsRuntimeOption ? ["--js-runtimes", jsRuntimeOption] : []),
    url,
  ]);

  if (result.code !== 0) {
    throw createCommandError(result.stderr || result.stdout);
  }

  const parsed = JSON.parse(result.stdout) as YoutubePlaylistMetadata;
  const entries = (parsed.entries || [])
    .map<PlaylistItemRecord | null>((entry, index) => {
      const targetUrl = entry.id
        ? `https://www.youtube.com/watch?v=${entry.id}`
        : entry.url || undefined;

      if (!targetUrl) {
        return null;
      }

      return {
        id: nanoid(8),
        index,
        url: targetUrl,
        title: entry.title,
        status: "queued" as const,
        progress: 0,
      };
    })
    .filter((entry): entry is PlaylistItemRecord => entry !== null);

  return {
    title: parsed.title,
    items: entries,
  };
}

function calculatePlaylistProgress(items: PlaylistItemRecord[], packaging = false) {
  if (items.length === 0) {
    return packaging ? 97 : 0;
  }

  const completedUnits = items.reduce((total, item) => {
    if (item.status === "completed" || item.status === "failed") {
      return total + 1;
    }

    return total + item.progress / 100;
  }, 0);

  const normalized = completedUnits / items.length;
  const scaled = Math.round(normalized * 95);
  return packaging ? Math.max(scaled, 97) : Math.min(scaled, 95);
}

function updatePlaylistJob(
  controller: JobController,
  jobId: string,
  updater: (job: DownloadJobRecord) => Partial<DownloadJobRecord>,
) {
  const job = controller.getJobOrThrow(jobId);
  const patch = updater(job);
  return controller.updateJob(jobId, patch);
}

function updatePlaylistItem(
  controller: JobController,
  jobId: string,
  itemId: string,
  patch: Partial<PlaylistItemRecord>,
  stage?: string,
) {
  return updatePlaylistJob(controller, jobId, (job) => {
    const items = (job.items || []).map((item) =>
      item.id === itemId ? { ...item, ...patch } : item,
    );
    const completedCount = items.filter((item) => item.status === "completed").length;
    const failedCount = items.filter((item) => item.status === "failed").length;

    return {
      items,
      completedCount,
      failedCount,
      progress: calculatePlaylistProgress(items),
      stage: stage ?? job.stage,
    };
  });
}

function updateSingleVideoProgress(
  controller: JobController,
  jobId: string,
  line: string,
) {
  const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (progressMatch) {
    const nextProgress = Math.max(
      1,
      Math.min(94, Math.round(Number.parseFloat(progressMatch[1]))),
    );

    controller.updateJob(jobId, {
      status: "downloading",
      progress: nextProgress,
      stage: "Downloading video and audio streams",
    });
    return;
  }

  if (line.includes("[download] Destination")) {
    controller.updateJob(jobId, {
      status: "downloading",
      progress: 2,
      stage: "Preparing output container",
    });
    return;
  }

  if (line.includes("[Merger]")) {
    controller.updateJob(jobId, {
      status: "merging",
      progress: 96,
      stage: "Merging video and audio into MP4",
    });
  }
}

function updatePlaylistProgress(
  controller: JobController,
  jobId: string,
  itemId: string,
  line: string,
  stagePrefix: string,
) {
  const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (progressMatch) {
    const nextProgress = Math.max(
      1,
      Math.min(94, Math.round(Number.parseFloat(progressMatch[1]))),
    );
    updatePlaylistItem(
      controller,
      jobId,
      itemId,
      {
        status: "downloading",
        progress: nextProgress,
      },
      stagePrefix,
    );
    return;
  }

  if (line.includes("[download] Destination")) {
    updatePlaylistItem(
      controller,
      jobId,
      itemId,
      {
        status: "downloading",
        progress: 2,
      },
      stagePrefix,
    );
    return;
  }

  if (line.includes("[Merger]")) {
    updatePlaylistItem(
      controller,
      jobId,
      itemId,
      {
        status: "merging",
        progress: 96,
      },
      stagePrefix,
    );
  }
}

async function mergeDownloadedStreams(
  videoPath: string,
  audioPath: string,
  outputPath: string,
) {
  const tempPath = outputPath.replace(/\.mp4$/i, ".temp.mp4");

  try {
    await runFfmpegCommand([
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      tempPath,
    ]);
  } catch {
    await runFfmpegCommand([
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      tempPath,
    ]);
  }

  await fs.rename(tempPath, outputPath);
}

function isIntermediateStreamFile(fileName: string) {
  return /\.f\d+\./i.test(fileName);
}

async function finalizeDownloadOutput(
  workingDirectory: string,
  finalBaseName: string,
): Promise<DownloadOutput> {
  const entries = await fs.readdir(workingDirectory);
  const mediaFiles = entries.filter((file) => /\.(mp4|m4a|webm|mp3|aac)$/i.test(file));
  const mergedName = `${finalBaseName}.mp4`;
  const mergedPath = path.join(workingDirectory, mergedName);

  if (mediaFiles.includes(mergedName)) {
    const stat = await fs.stat(mergedPath);
    return {
      outputPath: mergedPath,
      fileName: mergedName,
      fileSizeBytes: stat.size,
    };
  }

  const audioCandidate = mediaFiles.find((file) => /\.(m4a|aac|mp3|webm)$/i.test(file));
  const videoCandidate = mediaFiles.find(
    (file) => file.endsWith(".mp4") && file !== mergedName,
  );

  if (videoCandidate && audioCandidate) {
    const videoPath = path.join(workingDirectory, videoCandidate);
    const audioPath = path.join(workingDirectory, audioCandidate);

    await mergeDownloadedStreams(videoPath, audioPath, mergedPath);
    await fs.rm(videoPath, { force: true });
    await fs.rm(audioPath, { force: true });

    const stat = await fs.stat(mergedPath);
    return {
      outputPath: mergedPath,
      fileName: mergedName,
      fileSizeBytes: stat.size,
    };
  }

  const standaloneMp4 = mediaFiles.find(
    (file) => file.endsWith(".mp4") && !isIntermediateStreamFile(file),
  );

  if (standaloneMp4) {
    const outputPath = path.join(workingDirectory, standaloneMp4);
    if (standaloneMp4 !== mergedName) {
      await fs.rename(outputPath, mergedPath);
    }

    const stat = await fs.stat(mergedPath);
    return {
      outputPath: mergedPath,
      fileName: mergedName,
      fileSizeBytes: stat.size,
    };
  }

  if (videoCandidate) {
    throw new Error(
      "The download finished without a merged audio track. Check FFmpeg availability and YouTube extractor support.",
    );
  }

  throw new Error("The download finished, but the final MP4 could not be found.");
}

function buildFormatSelector(quality?: number): string {
  if (!quality) {
    return "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b";
  }
  const h = quality;
  return (
    `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/` +
    `bv*[height<=${h}]+ba/` +
    `b[height<=${h}][ext=mp4]/` +
    `b[height<=${h}]/` +
    `bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b`
  );
}

async function downloadVideoAsset(
  url: string,
  workingDirectory: string,
  finalBaseName: string,
  onLogLine: (line: string) => void,
  quality?: number,
) {
  const outputTemplate = path.join(workingDirectory, "raw.%(ext)s");
  const jsRuntimeOption = resolveJsRuntimeOption();
  const formatSelector = buildFormatSelector(quality);

  await fs.mkdir(workingDirectory, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      resolveYtDlpBinary(),
      [
        "--no-playlist",
        "--newline",
        "--max-filesize",
        "2G",
        ...(jsRuntimeOption ? ["--js-runtimes", jsRuntimeOption] : []),
        "-f",
        formatSelector,
        "-o",
        outputTemplate,
        url,
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    let stdout = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const consume = (source: "stdout" | "stderr", chunk: Buffer | string) => {
      const text = chunk.toString();
      if (source === "stdout") {
        stdout += text;
        stdoutBuffer += text;
      } else {
        stderr += text;
        stderrBuffer += text;
      }

      const target = source === "stdout" ? stdoutBuffer : stderrBuffer;
      const lines = target.split(/\r?\n/);
      const remainder = lines.pop() ?? "";

      for (const line of lines) {
        onLogLine(line.trim());
      }

      if (source === "stdout") {
        stdoutBuffer = remainder;
      } else {
        stderrBuffer = remainder;
      }
    };

    child.stdout.on("data", (chunk) => consume("stdout", chunk));
    child.stderr.on("data", (chunk) => consume("stderr", chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      if (stdoutBuffer) {
        onLogLine(stdoutBuffer.trim());
      }

      if (stderrBuffer) {
        onLogLine(stderrBuffer.trim());
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(createCommandError(stderr || stdout));
    });
  });

  return finalizeDownloadOutput(workingDirectory, finalBaseName);
}

async function createPlaylistArchive(
  jobDirectory: string,
  playlistFileName: string,
  files: Array<{ path: string; name: string }>,
) {
  const zipPath = path.join(jobDirectory, playlistFileName);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);

    for (const file of files) {
      archive.file(file.path, { name: file.name });
    }

    void archive.finalize();
  });

  const stat = await fs.stat(zipPath);
  return {
    outputPath: zipPath,
    fileName: playlistFileName,
    fileSizeBytes: stat.size,
  };
}

async function processSingleVideoJob(jobId: string, controller: JobController) {
  const job = controller.getJobOrThrow(jobId);

  controller.updateJob(jobId, {
    status: "preparing",
    progress: 1,
    stage: "Fetching video metadata",
  });

  const metadata = await fetchVideoMetadata(job.url);
  controller.updateJob(jobId, {
    ...metadata,
    stage: "Metadata ready, queued for download",
  });

  const finalBaseName = sanitizeFileName(metadata.title || `youtube-${jobId}`);
  const output = await downloadVideoAsset(
    job.url,
    getJobDirectory(jobId),
    finalBaseName,
    (line) => updateSingleVideoProgress(controller, jobId, line),
    job.quality,
  );

  if (output.fileSizeBytes > MAX_DOWNLOAD_BYTES) {
    throw new Error("The merged file exceeds the 2 GB size limit.");
  }

  controller.completeJob(jobId, {
    outputPath: output.outputPath,
    fileName: output.fileName,
    fileSizeBytes: output.fileSizeBytes,
    title: metadata.title,
    thumbnail: metadata.thumbnail,
    resolution: metadata.resolution,
    durationSeconds: metadata.durationSeconds,
    stage: "Download ready",
  });
}

async function processPlaylistJob(jobId: string, controller: JobController) {
  controller.updateJob(jobId, {
    status: "preparing",
    progress: 1,
    stage: "Fetching playlist metadata",
  });

  const playlist = await fetchPlaylistMetadata(controller.getJobOrThrow(jobId).url);
  if (playlist.items.length === 0) {
    throw new Error("The playlist does not contain any downloadable videos.");
  }

  controller.updateJob(jobId, {
    title: playlist.title,
    playlistTitle: playlist.title,
    itemCount: playlist.items.length,
    items: playlist.items,
    stage: `Preparing ${playlist.items.length} playlist videos`,
  });

  const jobDirectory = getJobDirectory(jobId);
  await fs.mkdir(jobDirectory, { recursive: true });

  for (const item of playlist.items) {
    updatePlaylistItem(
      controller,
      jobId,
      item.id,
      {
        status: "preparing",
        progress: 1,
      },
      `Downloading ${item.index + 1} of ${playlist.items.length}`,
    );

    try {
      const metadata = await fetchVideoMetadata(item.url);
      updatePlaylistItem(controller, jobId, item.id, {
        title: metadata.title || item.title,
        thumbnail: metadata.thumbnail,
        resolution: metadata.resolution,
        durationSeconds: metadata.durationSeconds,
      });

      const safeTitle = sanitizeFileName(
        metadata.title || item.title || `playlist-item-${item.index + 1}`,
      );
      const finalBaseName = `${String(item.index + 1).padStart(2, "0")} - ${safeTitle}`;
      const workingDirectory = path.join(jobDirectory, item.id);

      const output = await downloadVideoAsset(
        item.url,
        workingDirectory,
        finalBaseName,
        (line) =>
          updatePlaylistProgress(
            controller,
            jobId,
            item.id,
            line,
            `Downloading ${item.index + 1} of ${playlist.items.length}`,
          ),
        controller.getJob(jobId)?.quality,
      );

      if (output.fileSizeBytes > MAX_DOWNLOAD_BYTES) {
        throw new Error("This playlist item exceeds the 2 GB file size limit.");
      }

      updatePlaylistItem(
        controller,
        jobId,
        item.id,
        {
          status: "completed",
          progress: 100,
          fileName: output.fileName,
          fileSizeBytes: output.fileSizeBytes,
          outputPath: output.outputPath,
          error: undefined,
        },
        `Finished ${item.index + 1} of ${playlist.items.length}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "This playlist item failed.";

      updatePlaylistItem(
        controller,
        jobId,
        item.id,
        {
          status: "failed",
          progress: 100,
          error: message,
        },
        `One playlist item failed`,
      );
    }
  }

  const completedJob = controller.getJobOrThrow(jobId);
  const completedItems =
    completedJob.items?.filter((item) => item.status === "completed" && item.outputPath) || [];

  if (completedItems.length === 0) {
    throw new Error("The playlist finished with no downloadable videos.");
  }

  controller.updateJob(jobId, {
    status: "merging",
    progress: 97,
    stage: "Packaging playlist ZIP archive",
  });

  const playlistFileName = `${sanitizeFileName(
    completedJob.playlistTitle || completedJob.title || "playlist",
  )}.zip`;

  const archive = await createPlaylistArchive(
    jobDirectory,
    playlistFileName,
    completedItems.map((item) => ({
      path: item.outputPath!,
      name: item.fileName || `${item.id}.mp4`,
    })),
  );

  const warning =
    (completedJob.failedCount || 0) > 0
      ? `${completedJob.failedCount} playlist item(s) failed and were skipped from the ZIP.`
      : undefined;

  controller.completeJob(jobId, {
    fileName: archive.fileName,
    fileSizeBytes: archive.fileSizeBytes,
    zipOutputPath: archive.outputPath,
    playlistTitle: completedJob.playlistTitle,
    title: completedJob.playlistTitle,
    stage: "Playlist ready",
    error: warning,
    completedCount: completedItems.length,
    failedCount: completedJob.failedCount,
    items: completedJob.items,
  });
}

export async function processDownloadJob(jobId: string, controller: JobController) {
  const job = controller.getJobOrThrow(jobId);

  if (job.kind === "playlist") {
    await processPlaylistJob(jobId, controller);
    return;
  }

  await processSingleVideoJob(jobId, controller);
}
