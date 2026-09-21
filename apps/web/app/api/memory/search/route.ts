import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchSemanticMemories } from "@/lib/memory/semantic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const query = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).query : null;
  if (typeof query !== "string" || query.trim().length < 2) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json({ results: await searchSemanticMemories(session.user.id, query, { limit: 10 }) });
}
