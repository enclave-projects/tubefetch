# Request Flow

## End-to-End Flow

This document explains how a user action becomes a finished MP4 or ZIP download.

## 1. User Input

The user pastes a YouTube URL into the UI in `components/downloader-console.tsx`.

Client-side behavior:

- validates the URL with `isYoutubeUrl`
- shows immediate feedback for invalid input
- detects valid pasted URLs
- submits the request through `useDownloadJob`

## 2. Frontend Submission

The hook in `hooks/use-download-job.ts` sends:

```json
{ "url": "<user input>" }
```

to:

```text
POST /api/download
```

The hook then stores an optimistic `queued` job state and starts polling.

## 3. Backend Validation

`app/api/download/route.ts`:

- parses the JSON request body
- validates the shape with `zod`
- classifies the URL as either `video` or `playlist`
- normalizes the URL
- creates an in-memory job

Response:

```json
{ "jobId": "<generated id>" }
```

## 4. Queue Scheduling

`lib/job-queue.ts` immediately pushes the job ID into an internal FIFO queue and calls `pumpQueue()`.

Because concurrency is currently `1`:

- if no job is running, the worker starts immediately
- otherwise the job waits in memory until earlier jobs finish

## 5. Metadata Fetch

The worker first fetches metadata before downloading.

Single video:

- `yt-dlp --dump-single-json --no-playlist --skip-download`

Playlist:

- `yt-dlp --dump-single-json --flat-playlist --yes-playlist --skip-download`

Why this happens first:

- gives the UI a title, duration, resolution, and thumbnail early
- lets the backend know playlist size before processing items

## 6. Download Execution

The worker then starts `yt-dlp` with newline output enabled.

Important format selection:

```text
bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b
```

Meaning:

- prefer separate MP4 video plus M4A audio
- fall back to best separate streams
- fall back to progressive MP4
- fall back to best available format

The worker parses `yt-dlp` output lines and converts them into progress updates for the job state.

## 7. Muxing and Finalization

After download completes, the worker inspects the output directory.

Cases:

- already merged MP4 exists: use it
- separate MP4 + audio file exist: merge with FFmpeg
- standalone MP4 exists with a temporary name: rename it
- only video exists: fail, because silent output is not acceptable

FFmpeg tries stream copy first, then falls back to AAC transcoding if copy fails.

## 8. Playlist-Specific Handling

For playlists:

- each entry gets its own item record
- items are downloaded one after another
- each item can independently succeed or fail
- successful items remain available even if some items fail

When all items finish:

- if none succeeded, the whole job fails
- if at least one succeeded, the worker creates a ZIP archive from successful MP4s

## 9. Polling and UI Updates

The client polls:

```text
GET /api/status/:id
```

every 1.5 seconds until the job becomes:

- `completed`
- `failed`
- `expired`

The UI then renders:

- top-level progress
- stage text
- metadata
- playlist item states
- final download links

## 10. File Delivery

When the job is complete:

- single video download uses `GET /api/file/:id`
- playlist ZIP uses `GET /api/file/:id`
- playlist item MP4 uses `GET /api/file/:id/:itemId`

The backend streams files from disk using Node streams, not by loading them fully into memory first.

## 11. Expiry

Completed jobs get an expiry timestamp one hour in the future.

The cleanup loop later:

- deletes files from disk
- marks completed jobs as `expired`
- removes stale unfinished jobs from memory

That is why old job URLs stop working after the retention window.
