import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProfile, patchProfile } from "@/lib/profile/profile-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — perfil propio (nombre, zona, idioma). Nunca expone id ni email. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getProfile(session.user.id);
  return profile ? NextResponse.json({ profile }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** PATCH — { name?, timezone?, locale? }. Cualquier otro campo se ignora. */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const r = await patchProfile(session.user.id, body as Record<string, unknown>);
  if (!r.ok) {
    return NextResponse.json({ error: r.message, field: r.field }, { status: r.status });
  }
  return NextResponse.json({ profile: r.profile });
}
