import { jwtVerify } from "jose";

// Espejo TypeScript de decode_token() en apps/api/app/core/security.py —
// mismo secreto (API_SECRET_KEY) y mismo algoritmo (HS256), porque los
// tokens de verificación y de reset-password los firma el backend FastAPI
// pero se consumen del lado Next.js.
export interface ApiTokenPayload {
  sub: string;
  type: string;
  email?: string;
  [key: string]: unknown;
}

export async function decodeApiToken(token: string): Promise<ApiTokenPayload> {
  const secret = process.env.API_SECRET_KEY;
  if (!secret) {
    throw new Error("API_SECRET_KEY is not configured");
  }

  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
  });

  return payload as unknown as ApiTokenPayload;
}
