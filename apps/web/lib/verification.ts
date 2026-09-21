import { prisma } from "@ai-saas/database";
import { randomBytes } from "crypto";

// Cuánto vive el token de verificación en la tabla verification_tokens.
// Coincide con API_EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS del backend
// FastAPI (que es lo que realmente valida el JWT que viaja en el link) —
// esta expiración es la que ve el usuario si vuelve a intentar registrarse
// o pide un reenvío mientras la fila anterior sigue viva.
const VERIFICATION_TOKEN_TTL_HOURS = 24;

/**
 * Crea (o renueva) el link de verificación de email para un usuario pendiente
 * y dispara el correo a través del backend FastAPI. Se usa tanto al
 * registrar como al pedir un reenvío, para no duplicar esta lógica.
 */
export async function issueVerificationToken(userId: string, email: string) {
  // El modelo VerificationToken de NextAuth se identifica por
  // [identifier, token], no por userId — usamos el email como identifier,
  // que es el patrón estándar del adapter.
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  const rawToken = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: rawToken,
      expires: new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  // El backend FastAPI arma el JWT real que viaja en el link (mismo
  // mecanismo que ya usa reset-password) y dispara el correo vía Gmail
  // SMTP. La fila en verification_tokens queda como registro de auditoría
  // / mecanismo de invalidación server-side independiente del JWT.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!internalSecret) {
    console.error("INTERNAL_API_SECRET is not configured — cannot send verification email");
    return;
  }

  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/send-verification-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify({ user_id: userId, email }),
    });

    if (!res.ok) {
      console.error("Failed to queue verification email", await res.text());
    }
  } catch (err) {
    // No tumbamos el flujo que llama a esto si el correo falla en salir —
    // el usuario igual puede pedir otro reenvío. Se loguea para diagnóstico.
    console.error("Error calling verification email endpoint", err);
  }
}

/**
 * Avisa al dueño real de un email que una cuenta AXIS acaba de quedar
 * confirmada con esa dirección — sea porque se clickeó el link de
 * verificación o porque se entró por primera vez con Google. Se llama una
 * sola vez, en el momento exacto en que emailVerified pasa a tener valor,
 * para que si esa persona no fue quien creó la cuenta, tenga forma de
 * enterarse y revocarla.
 */
export async function sendAccountAlert(userId: string, email: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!internalSecret) {
    console.error("INTERNAL_API_SECRET is not configured — cannot send account alert email");
    return;
  }

  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/send-account-alert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify({ user_id: userId, email }),
    });

    if (!res.ok) {
      console.error("Failed to queue account alert email", await res.text());
    }
  } catch (err) {
    // No bloquea el flujo de verificación/login si este correo falla en
    // salir — es un aviso de seguridad adicional, no un paso obligatorio
    // del onboarding. Se loguea para diagnóstico.
    console.error("Error calling account alert endpoint", err);
  }
}
