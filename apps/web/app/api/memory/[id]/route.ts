import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { memoryEditSchema } from "@/lib/memory/schemas";
import { deleteMemory, editMemory, suppressMemory } from "@/lib/memory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — editar contenido (source pasa a user_edit). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = memoryEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { id } = await params;
  const m = await editMemory(session.user.id, id, parsed.data);
  return m ? NextResponse.json({ memory: m }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** DELETE — borra; con ?suppress=1 además bloquea que se vuelva a aprender. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const suppress = req.nextUrl.searchParams.get("suppress") === "1";
  const ok = suppress ? await suppressMemory(session.user.id, id) : await deleteMemory(session.user.id, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
