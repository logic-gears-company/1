import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { forgetTopic, previewTopic } from "@/lib/memory/forget-topic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    topic: z.string().trim().min(2).max(80),
    /** true ⇒ SOLO vista previa: no borra nada. */
    dryRun: z.boolean().optional(),
    /** Ids confirmados por el usuario en la vista previa: se borran EXACTAMENTE esos. */
    ids: z.array(z.string().min(1).max(64)).max(200).optional(),
  })
  .strict()
  .refine((v) => !(v.dryRun && v.ids), { message: "dryRun e ids no se combinan" });

/**
 * POST { topic, dryRun?, ids? } — "Olvida todo lo relacionado con X".
 *  · dryRun:true  → { total, matches: [{id,category,value}] }  (no modifica nada)
 *  · sin dryRun   → { deleted }   (con `ids`, solo esos)
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { topic, dryRun, ids } = parsed.data;
  const userId = session.user.id; // SIEMPRE de la sesión, nunca del cuerpo.

  if (dryRun) return NextResponse.json(await previewTopic(userId, topic));
  return NextResponse.json({ deleted: await forgetTopic(userId, topic, ids) });
}
