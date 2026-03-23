# TubeFetch

Self-hosted YouTube downloader — pick your quality, download as MP4, package playlists as ZIP.

Built with Next.js 15, yt-dlp, and FFmpeg.

---

## Features

- Paste any YouTube URL (video, short, live, playlist)
- Auto-fetches all available resolutions (4K → 360p) before you commit
- Audio always embedded — no separate audio files
- Real-time progress with live stage updates
- Playlist support: per-item progress + full ZIP download
- Files auto-deleted after 1 hour
- Light / dark theme
- Self-contained — no database, no external services

---

## Quick start (local)

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | |
| yt-dlp | latest | `pip install yt-dlp` or see [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) |
| FFmpeg | any recent | Bundled via `ffmpeg-static` as fallback |

```bash
git clone https://github.com/enclave-projects/tubefetch
cd tubefetch
npm install
npm run dev          # http://localhost:3000
```

### Environment variables (optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `YT_DLP_PATH` | `yt-dlp` (PATH) | Explicit path to yt-dlp binary |
| `FFMPEG_PATH` | bundled / PATH | Explicit path to FFmpeg binary |

Create a `.env.local` file if needed:

```env
YT_DLP_PATH=/usr/local/bin/yt-dlp
FFMPEG_PATH=/usr/bin/ffmpeg
```

---

## Docker

### Run with Docker

```bash
docker run -d \
  --name tubefetch \
  -p 3000:3000 \
  -v tubefetch-downloads:/app/downloads \
  ghcr.io/enclave-projects/tubefetch:latest
```

Open `http://localhost:3000`.

### Build locally

```bash
docker build -t tubefetch .
docker run -d -p 3000:3000 -v tubefetch-downloads:/app/downloads tubefetch
```

### Docker Compose

```yaml
services:
  tubefetch:
    image: ghcr.io/enclave-projects/tubefetch:latest
    ports:
      - "3000:3000"
    volumes:
      - downloads:/app/downloads
    restart: unless-stopped

volumes:
  downloads:
```

```bash
docker compose up -d
```

---

## API

All routes are under `/api`. The server requires Node.js runtime (not Edge).

### `POST /api/download`

Queue a download job.

**Request body**

```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "quality": 1080
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | ✓ | YouTube video or playlist URL |
| `quality` | number | — | Max height in px (e.g. `1080`, `720`). Omit for best available. |

**Response `200`**

```json
{ "jobId": "abc1234xyz" }
```

---

### `GET /api/formats?url=<youtube-url>`

Fetch available video qualities before downloading.

**Response `200`**

```json
{
  "title": "Video Title",
  "thumbnail": "https://i.ytimg.com/vi/.../maxresdefault.jpg",
  "durationSeconds": 213,
  "formats": [
    {
      "formatId": "137",
      "resolution": "1920x1080",
      "height": 1080,
      "fps": 30,
      "ext": "mp4",
      "vcodec": "avc1.640028",
      "acodec": "none",
      "fileSizeBytes": 89123456,
      "label": "1080p",
      "hasAudio": false
    }
  ]
}
```

---

### `GET /api/status/:id`

Poll job status.

**Response `200`**

```json
{
  "id": "abc1234xyz",
  "kind": "video",
  "status": "downloading",
  "progress": 47,
  "stage": "Downloading video and audio streams",
  "createdAt": 1700000000000,
  "updatedAt": 1700000001500,
  "expiresAt": null,
  "title": "Video Title",
  "thumbnail": "https://...",
  "resolution": "1920x1080",
  "durationSeconds": 213
}
```

**Status values**

| Value | Meaning |
|-------|---------|
| `queued` | Waiting in queue |
| `preparing` | Fetching metadata |
| `downloading` | yt-dlp running |
| `merging` | FFmpeg muxing video + audio |
| `completed` | File ready |
| `failed` | Error — see `error` field |
| `expired` | File was deleted after 1 hour |

---

### `GET /api/file/:id`

Download the completed MP4 (video) or ZIP (playlist).

### `GET /api/file/:id/:itemId`

Download an individual playlist item as MP4.

---

## Architecture

```
browser
  │
  ├─ POST /api/download ──► InMemoryDownloadQueue (lib/job-queue.ts)
  │                              │
  │                              └─ processDownloadJob (workers/download-worker.ts)
  │                                   ├─ yt-dlp  → raw streams
  │                                   └─ FFmpeg  → merged MP4
  │
  ├─ GET /api/status/:id  (polled every 1.5 s by use-download-job hook)
  │
  └─ GET /api/file/:id    (streamed download)
```

**Key files**

| Path | Role |
|------|------|
| `lib/job-queue.ts` | In-memory queue, singleton via `globalThis` |
| `workers/download-worker.ts` | yt-dlp spawn + FFmpeg mux pipeline |
| `lib/binaries.ts` | Binary resolution (env var → bundled → PATH) |
| `app/api/formats/route.ts` | Format listing endpoint |
| `hooks/use-download-job.ts` | Client polling hook |
| `components/downloader-console.tsx` | Main UI |

**Constraints**

- Queue concurrency: **1** (sequential downloads)
- Max file size: **2 GB** per MP4
- File retention: **1 hour** (cleanup loop runs every 10 min)
- No database — state is in-memory only (restarting the server loses active jobs)

---

## Deployment

### GitHub Container Registry (automatic)

Every push to `main` triggers the [Docker workflow](.github/workflows/docker.yml) which:

1. Builds the multi-stage Docker image
2. Pushes to `ghcr.io/enclave-projects/tubefetch:latest`
3. Also tags `sha-<commit>` and semver tags on `v*` pushes

Pull the latest image:

```bash
docker pull ghcr.io/enclave-projects/tubefetch:latest
```

### Self-host on a VPS

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Run TubeFetch
docker run -d \
  --name tubefetch \
  --restart unless-stopped \
  -p 3000:3000 \
  -v tubefetch-downloads:/app/downloads \
  ghcr.io/enclave-projects/tubefetch:latest
```

Add a reverse proxy (nginx / Caddy) in front for HTTPS.

---

## Contributing

1. Fork the repo
2. `npm install && npm run dev`
3. Make changes — `npx tsc --noEmit` must pass
4. Open a PR against `main`

---

## License

MIT
