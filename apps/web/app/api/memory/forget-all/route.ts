import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forgetAll } from "@/lib/memory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — "Forget everything". */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ deleted: await forgetAll(session.user.id) });
}
