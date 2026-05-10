import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/middleware";
import { verifyAdminToken, verifyAdminCredentials } from "@/lib/admin-auth";

export const runtime = "nodejs";

export const POST = withSecurity(
  async (request: Request) => {
    try {
      const body = await request.json();
      const { username, password, token } = body as {
        username?: string;
        password?: string;
        token?: string;
      };

      // Token-based auth (ADMIN_SECRET)
      if (token) {
        const valid = await verifyAdminToken(token);
        if (valid) {
          return NextResponse.json(
            { success: true, token },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        return NextResponse.json(
          { error: "Invalid token." },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }

      // Credentials-based auth
      if (username && password) {
        const valid = await verifyAdminCredentials(username, password);
        if (valid) {
          const adminSecret = process.env.ADMIN_SECRET ?? "";
          return NextResponse.json(
            { success: true, token: adminSecret },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        return NextResponse.json(
          { error: "Invalid credentials." },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }

      return NextResponse.json(
        { error: "Provide either a token or username and password." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  { maxRequests: 5, windowMs: 60000 },
);
