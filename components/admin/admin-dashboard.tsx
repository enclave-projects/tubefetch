"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  Database,
  Download,
  LogOut,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { LoginForm } from "@/components/admin/login-form";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Types                                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

type Tab = "overview" | "downloads" | "security";

interface Stats {
  totalDownloads: number;
  downloadsToday: number;
  totalBlockedIps: number;
}

interface HistoryRow {
  id: number;
  job_id: string;
  url: string;
  title: string | null;
  kind: string | null;
  status: string | null;
  quality: number | null;
  ip_address: string | null;
  file_size_bytes: number | null;
  created_at: string;
  completed_at: string | null;
}

interface BlockedIp {
  ip_address: string;
  reason: string | null;
  blocked_at: string;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tubefetch-admin-token");
}

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "unknown";
  const cls: Record<string, string> = {
    pending: "bg-zinc-500/15 text-zinc-400",
    completed: "bg-emerald-500/15 text-emerald-500",
    failed: "bg-red-500/15 text-red-400",
    downloading: "bg-blue-500/15 text-blue-400",
    merging: "bg-violet-500/15 text-violet-400",
    preparing: "bg-blue-500/15 text-blue-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls[s] ?? "bg-zinc-500/15 text-zinc-400"}`}
    >
      {s}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Main component                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

export function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilter, setHistoryFilter] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [newIp, setNewIp] = useState("");
  const [newIpReason, setNewIpReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [initMessage, setInitMessage] = useState<string | null>(null);

  // Check auth on mount
  useEffect(() => {
    const token = getToken();
    if (token) setAuthenticated(true);
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats", { headers: authHeaders() });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      setStats(data);
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(historyPage),
        limit: "20",
      });
      if (historyFilter) params.set("status", historyFilter);
      if (ipFilter) params.set("ip", ipFilter);

      const res = await fetch(`/api/admin/history?${params}`, {
        headers: authHeaders(),
      });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      setHistory(data.rows ?? []);
      setHistoryTotal(data.total ?? 0);
    } catch {
      /* ignore */
    }
  }, [historyPage, historyFilter, ipFilter]);

  // Fetch blocked IPs
  const fetchBlockedIps = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blocked-ips", {
        headers: authHeaders(),
      });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      setBlockedIps(data.ips ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch data when authenticated / tab changes
  useEffect(() => {
    if (!authenticated) return;
    if (tab === "overview") void fetchStats();
    if (tab === "downloads") void fetchHistory();
    if (tab === "security") void fetchBlockedIps();
  }, [authenticated, tab, fetchStats, fetchHistory, fetchBlockedIps]);

  // Block an IP
  async function handleBlockIp(e: React.FormEvent) {
    e.preventDefault();
    if (!newIp.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/admin/blocked-ips", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ip: newIp.trim(), reason: newIpReason.trim() || undefined }),
      });
      setNewIp("");
      setNewIpReason("");
      await fetchBlockedIps();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  // Unblock an IP
  async function handleUnblockIp(ip: string) {
    setLoading(true);
    try {
      await fetch("/api/admin/blocked-ips", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ ip }),
      });
      await fetchBlockedIps();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  // Initialize database
  async function handleInitDb() {
    setLoading(true);
    setInitMessage(null);
    try {
      const res = await fetch("/api/admin/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: getToken() }),
      });
      const data = await res.json();
      setInitMessage(data.message ?? data.error ?? "Done.");
    } catch {
      setInitMessage("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  // Logout
  function handleLogout() {
    localStorage.removeItem("tubefetch-admin-token");
    setAuthenticated(false);
  }

  /* ── Not authenticated ── */
  if (!authenticated) {
    return <LoginForm onSuccess={() => setAuthenticated(true)} />;
  }

  const totalPages = Math.max(1, Math.ceil(historyTotal / 20));

  /* ── Authenticated dashboard ── */
  return (
    <main className="relative z-10 min-h-screen px-4 pb-16 pt-5 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* ── Header ── */}
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--muted)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            >
              <ArrowLeft className="size-3.5" />
              App
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--accent)] shadow-[0_0_14px_rgba(59,130,246,0.45)]">
                <Shield className="size-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-[14px] font-bold tracking-tight">
                Admin Panel
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--muted)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <LogOut className="size-3.5" />
            Logout
          </button>
        </nav>

        {/* ── Tab navigation ── */}
        <div className="flex gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--muted)] p-1">
          {(
            [
              { id: "overview", label: "Overview", icon: Activity },
              { id: "downloads", label: "Downloads", icon: Download },
              { id: "security", label: "Security", icon: Shield },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
                tab === id
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="panel p-5 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Total Downloads
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {stats?.totalDownloads ?? "-"}
                </p>
              </div>
              <div className="panel p-5 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Downloads Today
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {stats?.downloadsToday ?? "-"}
                </p>
              </div>
              <div className="panel p-5 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Blocked IPs
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {stats?.totalBlockedIps ?? "-"}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="panel space-y-4 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Actions
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={fetchStats}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--muted)] px-4 py-2 text-[12px] font-semibold transition-colors hover:text-[var(--foreground)]"
                >
                  <RefreshCw className="size-3.5" />
                  Refresh Stats
                </button>
                <button
                  onClick={handleInitDb}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--muted)] px-4 py-2 text-[12px] font-semibold transition-colors hover:text-[var(--foreground)] disabled:opacity-40"
                >
                  <Database className="size-3.5" />
                  Initialize Database
                </button>
              </div>
              {initMessage && (
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  {initMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Downloads tab ── */}
        {tab === "downloads" && (
          <div className="space-y-4 animate-fade-in">
            {/* Filters */}
            <div className="panel flex flex-wrap items-end gap-3 p-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Status
                </label>
                <select
                  value={historyFilter}
                  onChange={(e) => {
                    setHistoryFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="rounded-lg border border-[var(--border-strong)] bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--foreground)] focus:outline-none"
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  IP Address
                </label>
                <input
                  type="text"
                  value={ipFilter}
                  onChange={(e) => {
                    setIpFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                  placeholder="Filter by IP"
                  className="rounded-lg border border-[var(--border-strong)] bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus:outline-none"
                />
              </div>
              <button
                onClick={() => void fetchHistory()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--muted)] px-3 py-2 text-[12px] font-semibold transition-colors hover:text-[var(--foreground)]"
              >
                <RefreshCw className="size-3" />
                Refresh
              </button>
            </div>

            {/* Table */}
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      <th className="px-4 py-3">Job</th>
                      <th className="px-4 py-3">Title / URL</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">IP</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="px-4 py-3 font-mono text-[11px]">
                          {row.job_id}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3">
                          {row.title ?? row.url}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[var(--muted-foreground)]">
                          {row.ip_address ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-[var(--muted-foreground)]">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-[var(--muted-foreground)]"
                        >
                          No records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {historyTotal} total records
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage <= 1}
                    className="rounded-md border border-[var(--border-strong)] p-1.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="text-[11px] font-semibold">
                    {historyPage} / {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setHistoryPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={historyPage >= totalPages}
                    className="rounded-md border border-[var(--border-strong)] p-1.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Security tab ── */}
        {tab === "security" && (
          <div className="space-y-4 animate-fade-in">
            {/* Block IP form */}
            <div className="panel space-y-4 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Block IP Address
              </p>
              <form
                onSubmit={handleBlockIp}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    IP Address
                  </label>
                  <input
                    type="text"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    placeholder="e.g. 192.168.1.100"
                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Reason (optional)
                  </label>
                  <input
                    type="text"
                    value={newIpReason}
                    onChange={(e) => setNewIpReason(e.target.value)}
                    placeholder="Abuse, spam, etc."
                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !newIp.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-white transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  Block
                </button>
              </form>
            </div>

            {/* Blocked IPs list */}
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Blocked IPs ({blockedIps.length})
                </p>
                <button
                  onClick={() => void fetchBlockedIps()}
                  className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              </div>
              {blockedIps.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Ban className="size-5 text-[var(--muted-foreground)]" />
                  <p className="text-[12px] text-[var(--muted-foreground)]">
                    No blocked IPs.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {blockedIps.map((entry) => (
                    <div
                      key={entry.ip_address}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="space-y-0.5">
                        <p className="font-mono text-[13px] font-semibold">
                          {entry.ip_address}
                        </p>
                        <p className="text-[11px] text-[var(--muted-foreground)]">
                          {entry.reason ?? "No reason"} &middot;{" "}
                          {new Date(entry.blocked_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnblockIp(entry.ip_address)}
                        disabled={loading}
                        className="rounded-md border border-[var(--border-strong)] p-1.5 text-[var(--muted-foreground)] transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
