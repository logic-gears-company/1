import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-saas/database";
import { decodeApiToken } from "@/lib/api-jwt";

// POST porque esto borra la cuenta — el link del correo solo lleva a la
// página /revoke-account, que valida el token del lado servidor (ver
// generateMetadata / el propio componente de página) y muestra la
// confirmación; recién el botón de esa página dispara este POST. Nunca se
// borra nada con un simple GET, para no quedar expuesto a prefetchers de
// clientes de correo o escáneres de seguridad que siguen links
// automáticamente.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = body?.token as string | undefined;

  if (!token) {
    return NextResponse.json({ message: "Missing token" }, { status: 400 });
  }

  let payload;
  try {
    payload = await decodeApiToken(token);
  } catch {
    return NextResponse.json(
      { message: "This link is invalid or has expired." },
      { status: 400 }
    );
  }

  if (payload.type !== "account_revocation" || !payload.email) {
    return NextResponse.json({ message: "Invalid token" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user) {
    // Ya no existe — probablemente ya se revocó con este mismo link antes,
    // o el usuario se borró por otra vía. Responder OK igual: el estado
    // final que la persona quería (que la cuenta no exista) ya se cumple.
    return NextResponse.json({ message: "Account already removed" });
  }

  // Mismo chequeo que en verify-email: el token lleva el email vigente al
  // momento de crearse, y se revalida contra la fila real antes de borrar.
  if (user.email !== payload.email) {
    return NextResponse.json({ message: "Invalid token" }, { status: 400 });
  }

  // onDelete: Cascade en el schema se encarga de conversaciones, mensajes,
  // suscripciones, etc. audit_logs usa onDelete: SetNull, así que el
  // rastro de auditoría de esta cuenta sobrevive con userId en null.
  await prisma.user.delete({ where: { id: user.id } });

  return NextResponse.json({ message: "Account removed" });
}
