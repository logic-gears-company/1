import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listMemories } from "@/lib/memory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/memory — memorias vivas del usuario de la sesión. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ memories: await listMemories(session.user.id) });
}
