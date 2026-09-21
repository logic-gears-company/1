import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { userSettingsPatchSchema } from "@/lib/memory/schemas";
import { getSettings, patchSettings } from "@/lib/memory/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await getSettings(session.user.id) });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = userSettingsPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json({ settings: await patchSettings(session.user.id, parsed.data) });
}
