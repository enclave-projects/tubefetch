const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export type YoutubeTargetKind = "video" | "playlist";

export interface YoutubeTarget {
  kind: YoutubeTargetKind;
  normalizedUrl: string;
}

export function parseYoutubeTarget(input: string): YoutubeTarget | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();

    if (!YOUTUBE_HOSTS.has(host)) {
      return null;
    }

    if (host.includes("youtu.be")) {
      return url.pathname.length > 1
        ? { kind: "video", normalizedUrl: url.toString() }
        : null;
    }

    const playlistId = url.searchParams.get("list");
    const pathname = url.pathname.toLowerCase();

    if (
      playlistId &&
      (pathname === "/playlist" ||
        pathname === "/watch" ||
        pathname.startsWith("/shorts/") ||
        pathname.startsWith("/live/"))
    ) {
      const playlistUrl = new URL("https://www.youtube.com/playlist");
      playlistUrl.searchParams.set("list", playlistId);
      return {
        kind: "playlist",
        normalizedUrl: playlistUrl.toString(),
      };
    }

    const hasVideoId =
      url.searchParams.has("v") ||
      pathname.startsWith("/shorts/") ||
      pathname.startsWith("/live/") ||
      pathname.startsWith("/embed/");

    return hasVideoId
      ? { kind: "video", normalizedUrl: url.toString() }
      : null;
  } catch {
    return null;
  }
}

export function normalizeYoutubeUrl(input: string) {
  return parseYoutubeTarget(input)?.normalizedUrl ?? null;
}

export function isYoutubeUrl(input: string) {
  return parseYoutubeTarget(input) !== null;
}
