# Libraries and Dependencies

This document explains what the main libraries in TubeFetch are used for.

## Runtime Dependencies

### `next`

The web framework. It provides:

- App Router pages
- Route Handlers for the API
- server/client component model
- production build tooling

### `react` and `react-dom`

Used for the frontend UI and client-side state updates.

### `zod`

Used in the API layer to validate incoming JSON payloads before queueing jobs.

### `nanoid`

Generates compact unique job IDs and playlist item IDs.

### `archiver`

Builds ZIP archives for completed playlist downloads.

### `ffmpeg-static`

Provides a bundled FFmpeg binary fallback when the host system does not provide a reliable one.

### `next-themes`

Supports dark/light mode switching.

### `sonner`

Provides toast notifications in the frontend.

### `lucide-react`

Provides the icon set used across the UI.

### `clsx`, `tailwind-merge`, `class-variance-authority`

These are utility libraries for building Tailwind-powered UI components cleanly.

## Dev Dependencies

### `typescript`

Adds static typing across the app.

### `eslint` and `eslint-config-next`

Used for linting and Next.js-aware static checks.

### `tailwindcss` and `@tailwindcss/postcss`

Used for styling and CSS processing.

### `@types/node`, `@types/react`, `@types/react-dom`, `@types/archiver`

Type definitions for TypeScript.

## External System Dependencies

These are not regular npm packages, but the app depends on them at runtime.

### `yt-dlp`

Used to:

- inspect video and playlist metadata
- download best-quality media streams
- provide line-based progress output

TubeFetch calls it directly from the worker with `spawn`.

### `ffmpeg`

Used to:

- merge separate video and audio streams into MP4
- apply `+faststart`
- fall back to AAC encoding when direct stream copy fails

## Why These Choices Were Made

The dependency set is intentionally small.

- no database client because job state is in memory
- no Redis because the queue is local-only
- no BullMQ yet because the current worker model is single-process
- no ORM because there is no persistence layer
- no uploader SDKs because files are stored locally

This keeps setup simple for self-hosting while still covering the core media pipeline.

## Libraries Not Yet Used

You mentioned BullMQ in the original direction, but the current implementation uses an in-memory queue instead. That means:

- fewer moving parts
- easier local setup
- less operational overhead
- weaker restart resilience and no multi-instance scaling

If you later move to Redis-backed jobs, BullMQ would be the natural upgrade path.
