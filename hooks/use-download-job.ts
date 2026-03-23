"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadJobResponse } from "@/lib/download-types";
import { parseYoutubeTarget } from "@/lib/youtube";

async function parseJsonResponse(response: Response) {
  const data = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(data.error || "The request failed.");
  }

  return data;
}

export function useDownloadJob() {
  const [job, setJob] = useState<DownloadJobResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pollingRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(
    async (jobId: string) => {
      const response = await fetch(`/api/status/${jobId}`, {
        cache: "no-store",
      });
      const data = (await parseJsonResponse(response)) as DownloadJobResponse;
      setJob(data);

      if (["completed", "failed", "expired"].includes(data.status)) {
        stopPolling();
      }

      return data;
    },
    [stopPolling],
  );

  const startDownload = useCallback(
    async (url: string, quality?: number) => {
      setIsSubmitting(true);

      try {
        const response = await fetch("/api/download", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url, ...(quality ? { quality } : {}) }),
        });

        const data = (await parseJsonResponse(response)) as { jobId: string };
        const inferredKind = parseYoutubeTarget(url)?.kind ?? "video";
        stopPolling();
        setJob({
          id: data.jobId,
          kind: inferredKind,
          status: "queued",
          progress: 0,
          stage: "Queued for processing",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: null,
        });

        const currentJob = await fetchStatus(data.jobId);
        if (!["completed", "failed", "expired"].includes(currentJob.status)) {
          pollingRef.current = window.setInterval(() => {
            void fetchStatus(data.jobId);
          }, 1500);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchStatus, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setJob(null);
    setIsSubmitting(false);
  }, [stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  return {
    job,
    isSubmitting,
    startDownload,
    reset,
  };
}
