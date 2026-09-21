import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-saas/database";
import { z } from "zod";
import { issueVerificationToken } from "@/lib/verification";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid input" }, { status: 400 });
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Misma respuesta exista o no la cuenta, y también si ya está verificada
  // — no revelamos por esta vía si un email está registrado.
  if (user && !user.emailVerified && !user.deletedAt) {
    await issueVerificationToken(user.id, user.email);
  }

  return NextResponse.json(
    { message: "If that account needs verification, we've sent a new link." },
    { status: 202 }
  );
}
