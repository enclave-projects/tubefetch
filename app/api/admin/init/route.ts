import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/middleware";
import { initializeDatabase } from "@/lib/db-schema";
import { createAdminUser } from "@/lib/admin-auth";

export const runtime = "nodejs";

export const POST = withSecurity(
  async (request: Request) => {
    try {
      const { token, adminUsername, adminPassword } = (await request.json()) as {
        token?: string;
        adminUsername?: string;
        adminPassword?: string;
      };

      const adminSecret = process.env.ADMIN_SECRET;
      if (!adminSecret || token !== adminSecret) {
        return NextResponse.json(
          { error: "Unauthorized." },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }

      await initializeDatabase();

      if (adminUsername && adminPassword) {
        await createAdminUser(adminUsername, adminPassword);
      }

      return NextResponse.json(
        { success: true, message: "Database initialized." },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json(
        { error: "Initialization failed." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  { maxRequests: 3, windowMs: 60000 },
);
