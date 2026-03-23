# Backend Architecture

## Overview

TubeFetch uses Next.js Route Handlers as the HTTP layer and an in-memory queue as the background execution layer. There is no separate backend service, no database, and no external queue broker. Everything runs inside the Next.js Node runtime.

The backend is intentionally simple:

- Route handlers validate and enqueue work
- The queue stores job state in memory
- A worker process function performs extraction, muxing, and ZIP generation
- File routes stream generated files directly from disk

## Main Backend Components

### `app/api/download/route.ts`

Responsibilities:

- accepts `POST` requests
- validates JSON with `zod`
- parses the URL with `parseYoutubeTarget`
- rejects unsupported URLs
- creates a queue job with a normalized target URL

This route does not download anything itself. It returns quickly after creating a job.

### `lib/job-queue.ts`

Responsibilities:

- stores all job records in a `Map`
- stores pending job IDs in a FIFO array
- runs one active job at a time
- updates job state for queued, failed, completed, and expired states
- runs periodic cleanup every 10 minutes

Important behavior:

- concurrency is `1`
- queue state is process-local
- completed jobs remain queryable until they expire
- expired jobs lose their file paths so the download routes stop serving them

### `workers/download-worker.ts`

This is the core backend implementation.

Responsibilities:

- fetches video metadata with `yt-dlp --dump-single-json`
- fetches playlist metadata with `yt-dlp --flat-playlist --dump-single-json`
- downloads media with `yt-dlp`
- tracks worker output line by line for progress reporting
- merges separate video/audio streams with FFmpeg
- verifies that a final MP4 exists
- packages playlist results into ZIP archives with `archiver`

For playlists, the worker:

1. fetches playlist metadata
2. creates one item record per playlist entry
3. downloads items sequentially
4. keeps successful items even if later items fail
5. generates one ZIP from all successful items

### `app/api/status/[id]/route.ts`

Responsibilities:

- returns the serialized job state for polling
- never caches responses

This is the endpoint the frontend uses for the live progress view.

### `app/api/file/[id]/route.ts`

Responsibilities:

- checks that the job exists
- checks that the job is completed and not expired
- resolves the correct file path
- streams:
  - MP4 for single video jobs
  - ZIP for playlist jobs

### `app/api/file/[id]/[itemId]/route.ts`

Responsibilities:

- validates playlist job existence
- finds a completed playlist item
- streams that item’s MP4

## Binary Resolution

The backend uses `lib/binaries.ts` to resolve command paths.

Resolution rules:

- `YT_DLP_PATH` wins for `yt-dlp`
- `FFMPEG_PATH` wins for FFmpeg
- otherwise the app prefers bundled `ffmpeg-static`
- then it tries a Scoop FFmpeg binary on Windows
- finally it falls back to plain `ffmpeg` on `PATH`

This avoids depending on a fragile shell environment at runtime.

## File Output Strategy

All generated files live under `downloads/`.

Single video:

- `/downloads/<jobId>/<sanitized-title>.mp4`

Playlist:

- `/downloads/<jobId>/<itemId>/<index-title>.mp4`
- `/downloads/<jobId>/<playlist-title>.zip`

Filenames are sanitized before being written to disk.

## Failure Handling

Failure is handled at two levels.

### Job-level failures

Examples:

- invalid URL
- metadata extraction fails
- no final MP4 is produced
- playlist produces zero successful items

These mark the whole job as `failed`.

### Playlist item failures

Examples:

- one video becomes unavailable
- one item exceeds size limits
- one item fails to mux

These mark only that item as `failed`. The playlist job can still complete if at least one item succeeds.

## Cleanup and Expiry

Retention is controlled by `DOWNLOAD_RETENTION_MS`, currently one hour.

Cleanup behavior:

- timer runs every 10 minutes
- expired directories are removed from disk
- completed jobs become `expired`
- non-completed stale jobs are removed from memory entirely

This keeps the storage footprint bounded without needing a cron service.

## Security and Input Handling

Current safeguards:

- request JSON is validated with `zod`
- only recognized YouTube hosts are accepted
- URLs are normalized before queueing
- filenames are sanitized before writing to disk
- `spawn` uses explicit argument arrays rather than shell interpolation
- file size is capped at roughly 2 GB

Current limitations:

- no auth or rate limiting
- no tenant isolation
- no persistence across restarts
- no distributed queue support

## Production Notes

This backend is production-usable for a single self-hosted instance, but not horizontally scalable yet. If you want to evolve it further, the next backend upgrades would usually be:

- Redis-backed queue
- persistent job store
- auth and rate limiting
- structured logs
- metrics and tracing
- containerized binary management
