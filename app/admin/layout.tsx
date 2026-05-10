import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TubeFetch Admin",
  description: "Admin panel for TubeFetch",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
