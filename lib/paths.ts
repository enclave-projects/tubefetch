import path from "node:path";

export function getDownloadsRoot() {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "downloads");
}

export function getJobDirectory(jobId: string) {
  return path.join(getDownloadsRoot(), jobId);
}
