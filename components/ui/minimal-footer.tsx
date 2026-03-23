import { GithubIcon, ArrowDownToLine } from "lucide-react";

export function MinimalFooter() {
  const year = new Date().getFullYear();

  const links = [
    { title: "Docs", href: "#" },
    { title: "API", href: "#" },
    { title: "Privacy", href: "#" },
  ];

  return (
    <footer className="relative z-10 mt-8">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="h-px w-full bg-[var(--border)]" />
        <div className="flex flex-col items-center justify-between gap-3 py-5 sm:flex-row">
          {/* Brand */}
          <div className="flex items-center gap-2 opacity-60">
            <ArrowDownToLine className="size-4" strokeWidth={2.5} />
            <span className="text-[12px] font-bold tracking-tight">TubeFetch</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-4">
            {links.map(({ href, title }) => (
              <a
                key={title}
                href={href}
                className="text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
              >
                {title}
              </a>
            ))}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <GithubIcon className="size-3.5" />
            </a>
          </div>

          {/* Copyright */}
          <p className="text-[11px] text-[var(--muted-foreground)]">
            © {year} TubeFetch. Self-hosted.
          </p>
        </div>
      </div>
    </footer>
  );
}
