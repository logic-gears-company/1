import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-saas/database";
import { decodeApiToken } from "@/lib/api-jwt";
import { sendAccountAlert } from "@/lib/verification";

// GET porque el link vive en un email y se abre con un click normal —
// no hay formulario intermedio. El resultado se comunica con un query
// param que la página /verify-email interpreta (?status=success|error).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  // No se usa req.url como base: detrás de un túnel (ngrok u otro proxy)
  // que no reescriba el Host correctamente, Next.js puede ver la request
  // como si llegara a localhost:3000 aunque el navegador haya entrado por
  // el dominio público — eso produce un redirect a localhost que el
  // teléfono no puede resolver (ERR_SSL_PROTOCOL_ERROR si además fuerza
  // https). Se arma la base desde una variable de entorno explícita, la
  // misma fuente de verdad que ya usa el backend FastAPI para construir
  // el link original del correo.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const redirectTo = (status: "success" | "error" | "expired", detail?: string) => {
    const url = new URL(`${appUrl}/verify-email`);
    url.searchParams.set("status", status);
    if (detail) url.searchParams.set("reason", detail);
    return NextResponse.redirect(url);
  };

  if (!token) {
    return redirectTo("error", "missing_token");
  }

  let payload;
  try {
    payload = await decodeApiToken(token);
  } catch (err) {
    // "code" está confirmado en todas las versiones de jose (2.x-6.x): es
    // el discriminador estable, así que no dependemos de instanceof contra
    // una clase de error específica que podría no estar en el named export
    // top-level según la versión exacta instalada.
    const expired = (err as { code?: string })?.code === "ERR_JWT_EXPIRED";
    return redirectTo(expired ? "expired" : "error", "invalid_token");
  }

  if (payload.type !== "email_verification" || !payload.email) {
    return redirectTo("error", "wrong_token_type");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user || user.deletedAt) {
    return redirectTo("error", "user_not_found");
  }

  // El JWT lleva el email vigente al momento de pedir la verificación. Si
  // el usuario cambió de correo después de generar el link (no hay flujo
  // para eso hoy, pero por si se agrega más adelante), un token viejo no
  // debe poder verificar la dirección nueva.
  if (user.email !== payload.email) {
    return redirectTo("error", "email_mismatch");
  }

  // updateMany condicionado en vez de "if (!user.emailVerified) update(...)":
  // si este mismo link se abre dos veces casi al mismo tiempo (dos
  // pestañas, un reintento automático del navegador), la condición
  // emailVerified:null vive dentro del propio UPDATE — Postgres garantiza
  // que como mucho una de las llamadas encuentre la fila todavía sin
  // verificar. `count` es la única fuente de verdad sobre si esta llamada
  // fue la que realmente verificó la cuenta, sin la ventana de carrera de
  // leer el estado en un paso separado de escribirlo.
  const verifyResult = await prisma.user.updateMany({
    where: { id: user.id, emailVerified: null },
    data: { emailVerified: new Date() },
  });

  if (verifyResult.count > 0) {
    await prisma.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: "EMAIL_VERIFY",
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    });

    // Solo acá, dentro del "esta llamada fue la que recién confirmó por
    // primera vez" — si el link se reabre después (ya verificado), no se
    // manda de nuevo.
    await sendAccountAlert(user.id, user.email);
  }

  // Fila de invalidación server-side: una vez consumido, el link no debe
  // volver a funcionar aunque el JWT en sí siga sin expirar.
  await prisma.verificationToken.deleteMany({ where: { identifier: user.email } });

  return redirectTo("success");
}
