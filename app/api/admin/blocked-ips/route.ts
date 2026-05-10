import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/middleware";
import { extractBearerToken, verifyAdminToken } from "@/lib/admin-auth";
import { blockIp, unblockIp, getBlockedIps, isValidIpAddress } from "@/lib/security";

export const runtime = "nodejs";

export const GET = withSecurity(
  async (request: Request) => {
    const token = extractBearerToken(request);
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const ips = await getBlockedIps();
    return NextResponse.json(
      { ips },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  { maxRequests: 30, windowMs: 60000 },
);

export const POST = withSecurity(
  async (request: Request) => {
    const token = extractBearerToken(request);
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const { ip, reason } = (await request.json()) as {
        ip?: string;
        reason?: string;
      };

      if (!ip) {
        return NextResponse.json(
          { error: "IP address is required." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      if (!isValidIpAddress(ip)) {
        return NextResponse.json(
          { error: "Invalid IP address format." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      await blockIp(ip, reason);
      return NextResponse.json(
        { success: true, message: `IP ${ip} blocked.` },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  { maxRequests: 30, windowMs: 60000 },
);

export const DELETE = withSecurity(
  async (request: Request) => {
    const token = extractBearerToken(request);
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const { ip } = (await request.json()) as { ip?: string };

      if (!ip) {
        return NextResponse.json(
          { error: "IP address is required." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      await unblockIp(ip);
      return NextResponse.json(
        { success: true, message: `IP ${ip} unblocked.` },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  { maxRequests: 30, windowMs: 60000 },
);
