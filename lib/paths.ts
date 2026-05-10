import path from "node:path";

export function getDownloadsRoot() {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "downloads");
}

export function getJobDirectory(jobId: string) {
  return path.join(getDownloadsRoot(), jobId);
}

/**
 * Validate that a candidate path resolves within the downloads root.
 * Throws if path traversal is detected.
 */
export function validatePathWithinRoot(candidatePath: string): string {
  const resolved = path.resolve(candidatePath);
  const root = path.resolve(getDownloadsRoot());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}
