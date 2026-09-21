import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-saas/database";
import { hash } from "bcryptjs";
import { z } from "zod";
import { issueVerificationToken } from "@/lib/verification";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Cuenta ya verificada: mensaje normal de "ya existe".
    if (existing.emailVerified) {
      return NextResponse.json(
        { message: "Email already registered" },
        { status: 409 }
      );
    }

    // Existe pero nunca verificó: no la re-creamos ni la re-hasheamos con
    // la password nueva (alguien podría estar tratando de "tomar" un email
    // ajeno sin acceso a esa bandeja). En cambio, reenviamos un link de
    // verificación fresco para el mismo registro pendiente.
    await issueVerificationToken(existing.id, existing.email);
    return NextResponse.json(
      { message: "We've resent a verification link to this email." },
      { status: 202 }
    );
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "USER",
      emailVerified: null,
    },
  });

  // Asignar plan free ya al crear — no depende de la verificación de email,
  // así el usuario no pierde el plan si tarda en confirmar.
  const freePlan = await prisma.plan.findFirst({ where: { tier: "FREE" } });
  if (freePlan) {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: freePlan.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
      },
    });
  }

  await issueVerificationToken(user.id, user.email);

  return NextResponse.json(
    { message: "Account created. Check your email to verify your address." },
    { status: 201 }
  );
}
