"use client";

import { useState } from "react";
import { Key, Lock, LogIn, Shield, User } from "lucide-react";

type AuthMode = "token" | "credentials";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [mode, setMode] = useState<AuthMode>("token");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body =
        mode === "token"
          ? { token }
          : { username, password };

      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Authentication failed.");
        return;
      }

      localStorage.setItem("tubefetch-admin-token", data.token);
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="panel w-full space-y-6 p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Shield className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Admin Login</h1>
            <p className="text-[12px] text-[var(--muted-foreground)]">
              Authenticate to access the admin panel
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-[var(--border-strong)] bg-[var(--muted)] p-1">
          <button
            type="button"
            onClick={() => setMode("token")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
              mode === "token"
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <Key className="size-3.5" />
            Token
          </button>
          <button
            type="button"
            onClick={() => setMode("credentials")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
              mode === "credentials"
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <User className="size-3.5" />
            Credentials
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "token" ? (
            <div className="space-y-1.5">
              <label
                htmlFor="admin-token"
                className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]"
              >
                Admin Token
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--muted)] px-3.5 py-3">
                <Key className="size-4 shrink-0 text-[var(--muted-foreground)]" />
                <input
                  id="admin-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter admin secret token"
                  className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="admin-username"
                  className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]"
                >
                  Username
                </label>
                <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--muted)] px-3.5 py-3">
                  <User className="size-4 shrink-0 text-[var(--muted-foreground)]" />
                  <input
                    id="admin-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="admin-password"
                  className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]"
                >
                  Password
                </label>
                <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--muted)] px-3.5 py-3">
                  <Lock className="size-4 shrink-0 text-[var(--muted-foreground)]" />
                  <input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-[12px] text-[var(--destructive)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_2px_12px_rgba(59,130,246,0.38)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_22px_rgba(59,130,246,0.55)] disabled:pointer-events-none disabled:opacity-40"
          >
            <LogIn className="size-4" />
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
