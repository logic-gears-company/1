import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { autoDetectTimezone } from "@/lib/profile/profile-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { timezone } — autodetección desde el navegador (§7).
 * Idempotente y barata: si ya hay una zona real, responde 200 sin escribir.
 * Nunca pisa una zona elegida a mano. `userId` sale de la sesión.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const detected = typeof body === "object" && body !== null ? (body as Record<string, unknown>).timezone : undefined;

  const r = await autoDetectTimezone(session.user.id, detected);
  return NextResponse.json({ updated: r.written });
}
