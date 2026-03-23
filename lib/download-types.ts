export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export const DOWNLOAD_RETENTION_MS = 60 * 60 * 1000;

export type DownloadJobStatus =
  | "queued"
  | "preparing"
  | "downloading"
  | "merging"
  | "completed"
  | "failed"
  | "expired";

export type DownloadJobKind = "video" | "playlist";

export type PlaylistItemStatus =
  | "queued"
  | "preparing"
  | "downloading"
  | "merging"
  | "completed"
  | "failed";

export interface PlaylistItemRecord {
  id: string;
  index: number;
  url: string;
  title?: string;
  thumbnail?: string;
  resolution?: string;
  durationSeconds?: number;
  status: PlaylistItemStatus;
  progress: number;
  error?: string;
  fileName?: string;
  fileSizeBytes?: number;
  outputPath?: string;
}

export interface DownloadJobRecord {
  id: string;
  url: string;
  kind: DownloadJobKind;
  quality?: number; // max height requested, e.g. 1080
  status: DownloadJobStatus;
  progress: number;
  stage: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  title?: string;
  thumbnail?: string;
  resolution?: string;
  durationSeconds?: number;
  error?: string;
  fileName?: string;
  fileSizeBytes?: number;
  outputPath?: string;
  playlistTitle?: string;
  itemCount?: number;
  completedCount?: number;
  failedCount?: number;
  items?: PlaylistItemRecord[];
  zipOutputPath?: string;
}

export interface PlaylistItemResponse {
  id: string;
  index: number;
  title?: string;
  thumbnail?: string;
  resolution?: string;
  durationSeconds?: number;
  status: PlaylistItemStatus;
  progress: number;
  error?: string;
  fileName?: string;
  fileSizeBytes?: number;
  downloadUrl?: string;
}

export interface DownloadJobResponse {
  id: string;
  kind: DownloadJobKind;
  status: DownloadJobStatus;
  progress: number;
  stage: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  title?: string;
  thumbnail?: string;
  resolution?: string;
  durationSeconds?: number;
  error?: string;
  fileName?: string;
  fileSizeBytes?: number;
  downloadUrl?: string;
  playlistTitle?: string;
  itemCount?: number;
  completedCount?: number;
  failedCount?: number;
  items?: PlaylistItemResponse[];
}

export interface JobController {
  getJobOrThrow(id: string): DownloadJobRecord;
  getJob(id: string): DownloadJobRecord | undefined;
  updateJob(id: string, patch: Partial<DownloadJobRecord>): DownloadJobRecord;
  failJob(id: string, error: string): DownloadJobRecord;
  completeJob(
    id: string,
    patch: Pick<DownloadJobRecord, "fileName" | "fileSizeBytes"> &
      Partial<DownloadJobRecord>,
  ): DownloadJobRecord;
}

function toPlaylistItemResponse(
  jobId: string,
  kind: DownloadJobKind,
  item: PlaylistItemRecord,
): PlaylistItemResponse {
  return {
    id: item.id,
    index: item.index,
    title: item.title,
    thumbnail: item.thumbnail,
    resolution: item.resolution,
    durationSeconds: item.durationSeconds,
    status: item.status,
    progress: item.progress,
    error: item.error,
    fileName: item.fileName,
    fileSizeBytes: item.fileSizeBytes,
    downloadUrl:
      kind === "playlist" && item.status === "completed"
        ? `/api/file/${jobId}/${item.id}`
        : undefined,
  };
}

export function toDownloadJobResponse(
  job: DownloadJobRecord,
): DownloadJobResponse {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    title: job.title,
    thumbnail: job.thumbnail,
    resolution: job.resolution,
    durationSeconds: job.durationSeconds,
    error: job.error,
    fileName: job.fileName,
    fileSizeBytes: job.fileSizeBytes,
    downloadUrl: job.status === "completed" ? `/api/file/${job.id}` : undefined,
    playlistTitle: job.playlistTitle,
    itemCount: job.itemCount,
    completedCount: job.completedCount,
    failedCount: job.failedCount,
    items: job.items?.map((item) => toPlaylistItemResponse(job.id, job.kind, item)),
  };
}
