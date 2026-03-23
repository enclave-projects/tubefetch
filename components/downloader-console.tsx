"use client";

import Image from "next/image";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Archive,
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  Film,
  ListVideo,
  Loader2,
  Link2,
  RotateCcw,
  ShieldCheck,
  XCircle,
  Zap,
  HardDrive,
  MonitorPlay,
} from "lucide-react";
import { toast } from "sonner";
import { useDownloadJob } from "@/hooks/use-download-job";
import { type DownloadJobResponse } from "@/lib/download-types";
import { cn, formatBytes, formatDuration, formatTimeRemaining } from "@/lib/utils";
import { isYoutubeUrl } from "@/lib/youtube";
import { ModeToggle } from "@/components/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import type { FormatsResponse, VideoFormat } from "@/app/api/formats/route";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Types                                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

type FetchState = "idle" | "loading" | "ready" | "error";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Small components                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function StatusPill({ status }: { status: DownloadJobResponse["status"] }) {
  const cfg = {
    queued:      { label: "Queued",      cls: "bg-zinc-500/15 text-zinc-400 dark:text-zinc-300" },
    preparing:   { label: "Preparing",   cls: "bg-blue-500/15 text-blue-500" },
    downloading: { label: "Downloading", cls: "bg-blue-500/15 text-blue-500" },
    merging:     { label: "Merging",     cls: "bg-violet-500/15 text-violet-400" },
    completed:   { label: "Complete",    cls: "bg-emerald-500/15 text-emerald-500" },
    failed:      { label: "Failed",      cls: "bg-red-500/15 text-red-400" },
    expired:     { label: "Expired",     cls: "bg-orange-500/15 text-orange-400" },
  }[status] ?? { label: status, cls: "bg-zinc-500/15 text-zinc-400" };

  const active = ["queued", "preparing", "downloading", "merging"].includes(status);

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", cfg.cls)}>
      {active && <span className="size-1.5 rounded-full bg-current" style={{ animation: "pulse 1.4s ease-in-out infinite" }} />}
      {cfg.label}
    </span>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-[var(--muted)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted-foreground)]", className)}>
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Progress bar                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function ProgressBar({ value, active }: { value: number; active: boolean }) {
  return (
    <div className="relative h-[4px] w-full overflow-hidden rounded-full bg-[var(--muted)]">
      <div
        className={cn("absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out", active ? "progress-shimmer" : "bg-[var(--accent)]")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Skeleton loaders                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function MetadataSkeleton() {
  return (
    <div className="animate-fade-in panel overflow-hidden">
      {/* Thumbnail skeleton */}
      <div className="skeleton aspect-video w-full rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="flex gap-2 pt-1">
          <div className="skeleton h-5 w-16 rounded-md" />
          <div className="skeleton h-5 w-16 rounded-md" />
          <div className="skeleton h-5 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function QualityCardsSkeleton() {
  return (
    <div className="flex gap-3 pb-1">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="skeleton min-w-[130px] flex-1 rounded-xl"
          style={{ height: 110, animationDelay: `${i * 0.07}s` }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Video metadata preview                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

function VideoPreview({
  meta,
  className,
}: {
  meta: FormatsResponse;
  className?: string;
}) {
  return (
    <div className={cn("panel animate-card-pop overflow-hidden", className)}>
      {meta.thumbnail && (
        <div className="relative overflow-hidden">
          <Image
            src={meta.thumbnail}
            alt={meta.title}
            width={1280}
            height={720}
            unoptimized
            className="aspect-video w-full object-cover"
          />
          {meta.durationSeconds != null && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
              {formatDuration(meta.durationSeconds)}
            </span>
          )}
        </div>
      )}
      <div className="p-4 space-y-2">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{meta.title}</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip><MonitorPlay className="size-3" />{meta.formats.length} qualities</Chip>
          {meta.durationSeconds != null && <Chip><Clock className="size-3" />{formatDuration(meta.durationSeconds)}</Chip>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Quality selector cards                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

const QUALITY_COLORS: Record<string, { badge: string; glow: string }> = {
  "4K":    { badge: "bg-amber-500/15 text-amber-400",  glow: "rgba(245,158,11,0.25)" },
  "1440p": { badge: "bg-violet-500/15 text-violet-400", glow: "rgba(139,92,246,0.22)" },
  "1080p": { badge: "bg-blue-500/15 text-blue-400",    glow: "rgba(59,130,246,0.22)" },
  "720p":  { badge: "bg-sky-500/15 text-sky-400",      glow: "rgba(14,165,233,0.20)" },
  "480p":  { badge: "bg-zinc-500/15 text-zinc-400",    glow: "rgba(113,113,122,0.18)" },
  "360p":  { badge: "bg-zinc-500/15 text-zinc-400",    glow: "rgba(113,113,122,0.15)" },
};

function QualityCard({
  fmt,
  selected,
  onSelect,
  index,
}: {
  fmt: VideoFormat;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const colors = QUALITY_COLORS[fmt.label] ?? QUALITY_COLORS["360p"];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "animate-card-pop relative min-w-[130px] flex-1 cursor-pointer rounded-xl border bg-[var(--card)] p-3.5 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg focus:outline-none",
        selected ? "quality-card-selected border-[var(--accent)]" : "border-[var(--border-strong)] hover:border-[var(--accent)]/50",
      )}
      style={{
        animationDelay: `${index * 0.055}s`,
        ...(selected ? { boxShadow: `0 0 0 1px var(--accent), 0 4px 20px ${colors.glow}` } : {}),
      }}
    >
      {/* Checkmark */}
      {selected && (
        <span className="animate-checkmark absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-[var(--accent)]">
          <CheckCircle2 className="size-3 text-white" strokeWidth={3} />
        </span>
      )}

      {/* Resolution label */}
      <div className="mb-2.5 flex items-baseline gap-1.5">
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", colors.badge)}>
          {fmt.label}
        </span>
        {fmt.fps && fmt.fps >= 60 && (
          <span className="rounded-md bg-emerald-500/12 px-1 py-0.5 text-[10px] font-semibold text-emerald-500">
            {fmt.fps}fps
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
          <MonitorPlay className="size-3 shrink-0" />
          <span className="font-mono">{fmt.resolution}</span>
        </div>
        {fmt.fps && (
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
            <Zap className="size-3 shrink-0" />
            <span className="font-mono">{fmt.fps} fps</span>
          </div>
        )}
        {fmt.fileSizeBytes && (
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
            <HardDrive className="size-3 shrink-0" />
            <span className="font-mono">~{formatBytes(fmt.fileSizeBytes)}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
          <Film className="size-3 shrink-0" />
          <span className="font-mono truncate">{fmt.ext.toUpperCase()} + audio</span>
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Job monitor panel                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

function JobMonitor({ job }: { job: DownloadJobResponse }) {
  const isActive = ["queued", "preparing", "downloading", "merging"].includes(job.status);

  return (
    <div className="panel animate-fade-up space-y-4 p-5 stagger-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Stage</p>
          <p className="font-mono text-[13px] text-[var(--foreground)]">{job.stage}</p>
        </div>
        <StatusPill status={job.status} />
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <ProgressBar value={job.progress} active={isActive} />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold text-[var(--accent)]">{job.progress}%</span>
          <span className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
            <Clock className="size-3" />{formatTimeRemaining(job.expiresAt)}
          </span>
        </div>
      </div>

      {/* Thumbnail for single video */}
      {job.thumbnail && job.kind === "video" && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <Image
            src={job.thumbnail}
            alt={job.title ?? "Video thumbnail"}
            width={1280}
            height={720}
            unoptimized
            className="aspect-video w-full object-cover"
          />
        </div>
      )}

      {/* Metadata row */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3.5 space-y-2">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug">
          {job.playlistTitle ?? job.title ?? "Fetching metadata…"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {job.kind === "playlist" ? (
            <>
              <Chip><ListVideo className="size-3" />{job.itemCount ?? 0} videos</Chip>
              <Chip>{job.completedCount ?? 0} ready</Chip>
              {(job.failedCount ?? 0) > 0 && (
                <Chip className="text-[var(--destructive)] !bg-[var(--destructive-soft)]">
                  <XCircle className="size-3" />{job.failedCount} failed
                </Chip>
              )}
            </>
          ) : (
            <>
              {job.resolution && <Chip><Film className="size-3" />{job.resolution}</Chip>}
              {job.durationSeconds != null && <Chip>{formatDuration(job.durationSeconds)}</Chip>}
            </>
          )}
          {job.fileSizeBytes != null && <Chip><HardDrive className="size-3" />{formatBytes(job.fileSizeBytes)}</Chip>}
        </div>
        {job.error && !["failed", "expired"].includes(job.status) && (
          <p className="text-[11px] text-[var(--destructive)]">{job.error}</p>
        )}
      </div>

      {/* Playlist item list */}
      {job.kind === "playlist" && (job.items?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            <Archive className="size-3" />Playlist items
          </p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {job.items!.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[13px] font-medium">
                    <span className="mr-2 font-mono text-[10px] text-[var(--muted-foreground)]">
                      {String(item.index + 1).padStart(2, "0")}
                    </span>
                    {item.title ?? "Fetching…"}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.fileSizeBytes != null && (
                      <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{formatBytes(item.fileSizeBytes)}</span>
                    )}
                    {item.downloadUrl && item.status === "completed" && (
                      <a href={item.downloadUrl} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-6 rounded-lg px-2 text-[10px] font-bold")}>
                        MP4
                      </a>
                    )}
                    {item.status === "failed" && <XCircle className="size-4 text-[var(--destructive)]" />}
                  </div>
                </div>
                <ProgressBar value={item.progress} active={["queued","preparing","downloading","merging"].includes(item.status)} />
                {item.error && <p className="text-[10px] text-[var(--destructive)]">{item.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3.5">
        <p className="text-[11px] text-[var(--muted-foreground)]">Auto-deleted after 1 hour</p>
        {job.downloadUrl && job.status === "completed" && (
          <a
            href={job.downloadUrl}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white shadow-[0_2px_12px_rgba(59,130,246,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(59,130,246,0.55)]"
          >
            {job.kind === "playlist" ? <Archive className="size-4" /> : <ArrowDownToLine className="size-4" strokeWidth={2.5} />}
            {job.kind === "playlist" ? "Download ZIP" : "Save MP4"}
          </a>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Main component                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

export function DownloaderConsole() {
  const [url, setUrl] = useState("");
  const [inputState, setInputState] = useState<"idle" | "valid" | "error">("idle");
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [meta, setMeta] = useState<FormatsResponse | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<VideoFormat | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchedUrl = useRef<string>("");

  const { job, isSubmitting, startDownload, reset } = useDownloadJob();
  const lastStatusRef = useRef<string | null>(null);

  /* ── Fetch formats when URL becomes valid ── */
  const fetchFormats = useCallback(async (targetUrl: string) => {
    if (lastFetchedUrl.current === targetUrl) return;
    lastFetchedUrl.current = targetUrl;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setFetchState("loading");
    setMeta(null);
    setSelectedQuality(null);
    setFetchError(null);

    try {
      const res = await fetch(`/api/formats?url=${encodeURIComponent(targetUrl)}`, {
        signal: ctrl.signal,
        cache: "no-store",
      });
      const data = await res.json() as FormatsResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load formats.");
      setMeta(data);
      // Auto-select best quality
      if (data.formats.length > 0) setSelectedQuality(data.formats[0]);
      setFetchState("ready");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFetchError(err instanceof Error ? err.message : "Failed to load formats.");
      setFetchState("error");
    }
  }, []);

  /* ── Watch URL changes ── */
  const deferredUrl = useDeferredValue(url);
  useEffect(() => {
    if (!deferredUrl) {
      setFetchState("idle");
      setMeta(null);
      setSelectedQuality(null);
      setFetchError(null);
      lastFetchedUrl.current = "";
      return;
    }
    if (isYoutubeUrl(deferredUrl)) {
      void fetchFormats(deferredUrl);
    }
  }, [deferredUrl, fetchFormats]);

  /* ── Job status toasts ── */
  useEffect(() => {
    if (!job || lastStatusRef.current === job.status) return;
    lastStatusRef.current = job.status;
    if (job.status === "completed") {
      toast.success("Download ready", {
        description: job.kind === "playlist"
          ? `${job.completedCount ?? 0} item(s) packaged and ready.`
          : `${job.title ?? "Your video"} is ready.`,
      });
    }
    if (job.status === "failed") toast.error("Download failed", { description: job.error ?? "Worker exited without output." });
    if (job.status === "expired") toast.info("Download expired", { description: "Temporary file removed after one hour." });
  }, [job]);

  /* ── Submit ── */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isYoutubeUrl(url)) {
      setInputState("error");
      inputWrapRef.current?.classList.add("input-shake");
      setTimeout(() => {
        inputWrapRef.current?.classList.remove("input-shake");
        setInputState("idle");
      }, 420);
      toast.error("Invalid URL", { description: "Paste a YouTube video or playlist link." });
      return;
    }
    if (fetchState === "loading") {
      toast.info("Loading formats…", { description: "Please wait a moment." });
      return;
    }
    try {
      await startDownload(url, selectedQuality?.height ?? undefined);
      toast.success("Job queued", { description: "Download is starting…" });
    } catch (err) {
      toast.error("Could not queue download", { description: err instanceof Error ? err.message : "Request failed." });
    }
  };

  /* ── Reset ── */
  const handleReset = () => {
    abortRef.current?.abort();
    setUrl("");
    setInputState("idle");
    setFetchState("idle");
    setMeta(null);
    setSelectedQuality(null);
    setFetchError(null);
    lastFetchedUrl.current = "";
    reset();
  };

  /* ── Input border color ── */
  const inputBorderClass =
    inputState === "error"   ? "border-[var(--destructive)]" :
    inputState === "valid"   ? "border-emerald-500" :
    fetchState === "loading" ? "border-[var(--accent)]/60" :
    fetchState === "ready"   ? "border-[var(--accent)]" :
    "border-[var(--border-strong)]";

  return (
    <main className="relative z-10 min-h-screen px-4 pb-16 pt-5 sm:px-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">

        {/* ── Nav ── */}
        <nav className="animate-fade-up flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--accent)] shadow-[0_0_14px_rgba(59,130,246,0.45)]">
              <ArrowDownToLine className="size-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[14px] font-bold tracking-tight">TubeFetch</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--muted)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] sm:inline-flex">
              <ShieldCheck className="size-3" />Self-hosted
            </span>
            <ModeToggle />
          </div>
        </nav>

        {/* ── Heading ── */}
        <div className="animate-fade-up stagger-1 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Download YouTube in full quality
          </h1>
          <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
            Paste a link — we fetch all available resolutions so you pick exactly what you want. Audio always included.
          </p>
        </div>

        {/* ── URL input card ── */}
        <div className="panel animate-fade-up stagger-2 p-4 sm:p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="yt-url" className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                YouTube URL
              </label>

              <div
                ref={inputWrapRef}
                className={cn(
                  "input-wrap flex items-center gap-2.5 rounded-xl border bg-[var(--muted)] px-3.5 py-3 transition-colors duration-200",
                  inputBorderClass,
                )}
              >
                {fetchState === "loading" ? (
                  <Loader2 className="animate-spin-fast size-4 shrink-0 text-[var(--accent)]" />
                ) : fetchState === "ready" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : inputState === "error" ? (
                  <AlertCircle className="size-4 shrink-0 text-[var(--destructive)]" />
                ) : (
                  <Link2 className="size-4 shrink-0 text-[var(--muted-foreground)]" />
                )}
                <input
                  ref={inputRef}
                  id="yt-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://youtube.com/watch?v=…"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (inputState === "error") setInputState("idle");
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (isYoutubeUrl(pasted)) {
                      setInputState("valid");
                      // Glow the input wrap
                      inputWrapRef.current?.classList.add("input-glow");
                      setTimeout(() => inputWrapRef.current?.classList.remove("input-glow"), 800);
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus:outline-none"
                />
                {url && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="shrink-0 rounded-md p-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <XCircle className="size-4" />
                  </button>
                )}
              </div>

              {/* Inline status */}
              <div className="flex min-h-4 items-center gap-1.5 text-[11px]">
                {fetchState === "loading" && (
                  <span className="animate-fade-in text-[var(--accent)]">
                    Fetching available qualities…
                  </span>
                )}
                {fetchState === "error" && fetchError && (
                  <span className="animate-fade-in text-[var(--destructive)]">{fetchError}</span>
                )}
                {fetchState === "idle" && (
                  <span className="text-[var(--muted-foreground)]">
                    Supports videos, shorts, live streams and playlists
                  </span>
                )}
              </div>
            </div>

            {/* ── Quality selector (only for single videos once loaded) ── */}
            {fetchState === "loading" && (
              <div className="animate-fade-in space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Available qualities</p>
                <div className="scroll-x flex gap-2.5 pb-1">
                  <QualityCardsSkeleton />
                </div>
              </div>
            )}

            {fetchState === "ready" && meta && meta.formats.length > 0 && (
              <div className="animate-slide-down space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Select quality — audio always included
                </p>
                <div className="scroll-x flex gap-2.5 pb-1">
                  {meta.formats.map((fmt, i) => (
                    <QualityCard
                      key={fmt.formatId}
                      fmt={fmt}
                      selected={selectedQuality?.height === fmt.height}
                      onSelect={() => setSelectedQuality(fmt)}
                      index={i}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !url || fetchState === "loading"}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition-all duration-200",
                  "bg-[var(--accent)] shadow-[0_2px_12px_rgba(59,130,246,0.38)]",
                  "hover:-translate-y-0.5 hover:shadow-[0_4px_22px_rgba(59,130,246,0.55)]",
                  "active:translate-y-0 active:shadow-sm",
                  "disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin-fast" />
                ) : (
                  <ArrowDownToLine className="size-4" strokeWidth={2.5} />
                )}
                {isSubmitting ? "Queuing…" : selectedQuality ? `Download ${selectedQuality.label}` : "Start download"}
              </button>

              {(url || job) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--muted)] px-4 py-2.5 text-[13px] font-semibold text-[var(--muted-foreground)] transition-colors hover:border-[var(--accent)]/60 hover:text-[var(--foreground)]"
                >
                  <RotateCcw className="size-4" />
                  Reset
                </button>
              )}
            </div>
          </form>
        </div>

        {/* ── Video preview (shows while choosing quality) ── */}
        {fetchState === "loading" && (
          <MetadataSkeleton />
        )}
        {fetchState === "ready" && meta && !job && (
          <VideoPreview meta={meta} className="animate-fade-up stagger-3" />
        )}

        {/* ── Job monitor (takes over once download starts) ── */}
        {job && <JobMonitor job={job} />}

        {/* ── Empty state ── */}
        {!url && !job && fetchState === "idle" && (
          <div className="panel animate-fade-up stagger-3 flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <ArrowDownToLine className="size-5" strokeWidth={1.8} />
            </div>
            <div className="space-y-1">
              <p className="text-[14px] font-semibold">Paste a YouTube link to start</p>
              <p className="max-w-xs text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                We'll fetch all available qualities so you can pick exactly what you want before downloading.
              </p>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
