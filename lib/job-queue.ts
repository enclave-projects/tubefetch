import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  DOWNLOAD_RETENTION_MS,
  type DownloadJobKind,
  type DownloadJobRecord,
  type JobController,
  toDownloadJobResponse,
} from "@/lib/download-types";
import { getDownloadsRoot } from "@/lib/paths";
import { processDownloadJob } from "@/workers/download-worker";

class InMemoryDownloadQueue implements JobController {
  private readonly jobs = new Map<string, DownloadJobRecord>();
  private readonly queue: string[] = [];
  private readonly concurrency = 1;
  private activeCount = 0;
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.startCleanupLoop();
  }

  createJob(url: string, kind: DownloadJobKind, quality?: number) {
    const now = Date.now();
    const job: DownloadJobRecord = {
      id: nanoid(10),
      url,
      kind,
      quality,
      status: "queued",
      progress: 0,
      stage:
        kind === "playlist" ? "Queued playlist for processing" : "Queued for processing",
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
      completedCount: 0,
      failedCount: 0,
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.pumpQueue();

    return job;
  }

  getJob(id: string) {
    const job = this.jobs.get(id);
    if (!job) {
      return undefined;
    }

    if (job.expiresAt && Date.now() > job.expiresAt && job.status === "completed") {
      job.status = "expired";
      job.progress = 100;
      job.stage = "The download expired and was removed";
      job.outputPath = undefined;
      job.zipOutputPath = undefined;
      job.items = job.items?.map((item) => ({
        ...item,
        outputPath: undefined,
      }));
      job.updatedAt = Date.now();
    }

    return job;
  }

  getJobOrThrow(id: string) {
    const job = this.getJob(id);
    if (!job) {
      throw new Error(`Job ${id} was not found.`);
    }

    return job;
  }

  updateJob(id: string, patch: Partial<DownloadJobRecord>) {
    const current = this.getJobOrThrow(id);
    const next = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };

    this.jobs.set(id, next);
    return next;
  }

  failJob(id: string, error: string) {
    return this.updateJob(id, {
      status: "failed",
      progress: 100,
      stage: "Download failed",
      error,
      expiresAt: Date.now() + DOWNLOAD_RETENTION_MS,
    });
  }

  completeJob(
    id: string,
    patch: Pick<DownloadJobRecord, "fileName" | "fileSizeBytes"> &
      Partial<DownloadJobRecord>,
  ) {
    return this.updateJob(id, {
      ...patch,
      status: "completed",
      progress: 100,
      error: patch.error,
      expiresAt: Date.now() + DOWNLOAD_RETENTION_MS,
    });
  }

  private pumpQueue() {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const nextJobId = this.queue.shift();
      if (!nextJobId) {
        return;
      }

      this.activeCount += 1;
      void processDownloadJob(nextJobId, this)
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "The download worker failed.";
          this.failJob(nextJobId, message);
        })
        .finally(() => {
          this.activeCount -= 1;
          this.pumpQueue();
        });
    }
  }

  private startCleanupLoop() {
    void fs.mkdir(getDownloadsRoot(), { recursive: true });

    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        void this.cleanupExpiredJobs();
      }, 10 * 60 * 1000);
      this.cleanupTimer.unref?.();
    }
  }

  private async cleanupExpiredJobs() {
    const now = Date.now();

    for (const [id, job] of this.jobs.entries()) {
      const shouldDelete =
        (job.expiresAt && now > job.expiresAt) ||
        now - job.updatedAt > DOWNLOAD_RETENTION_MS;

      if (!shouldDelete) {
        continue;
      }

      await fs.rm(path.join(getDownloadsRoot(), id), {
        recursive: true,
        force: true,
      });

      if (job.status === "completed") {
        this.jobs.set(id, {
          ...job,
          status: "expired",
          outputPath: undefined,
          zipOutputPath: undefined,
          items: job.items?.map((item) => ({
            ...item,
            outputPath: undefined,
          })),
          stage: "The download expired and was removed",
          updatedAt: now,
        });
        continue;
      }

      this.jobs.delete(id);
    }
  }

  getJobResponse(id: string) {
    const job = this.getJob(id);
    return job ? toDownloadJobResponse(job) : undefined;
  }
}

declare global {
  var __tubeFetchQueue: InMemoryDownloadQueue | undefined;
}

export const downloadQueue =
  globalThis.__tubeFetchQueue ?? (globalThis.__tubeFetchQueue = new InMemoryDownloadQueue());
