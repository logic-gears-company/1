import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, XCircle } from "lucide-react";
import { decodeApiToken } from "@/lib/api-jwt";
import { RevokeAccountConfirm } from "@/components/auth/revoke-account-confirm";

export const metadata: Metadata = { title: "Remove this account" };

// Server Component: decodifica el token solo para LEER (a qué email
// pertenece, si sigue vigente) y decidir qué mostrar. El borrado real
// nunca ocurre acá — ocurre en el POST que dispara el botón del
// componente cliente de abajo, nunca en este render ni en ningún GET.
export default async function RevokeAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <InvalidLink reason="This link is missing its token." />;
  }

  let payload;
  try {
    payload = await decodeApiToken(token);
  } catch {
    return <InvalidLink reason="This link is invalid or has expired." />;
  }

  if (payload.type !== "account_revocation" || !payload.email) {
    return <InvalidLink reason="This link is invalid." />;
  }

  return <RevokeAccountConfirm token={token} email={payload.email} />;
}

function InvalidLink({ reason }: { reason: string }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card/60 border border-border">
        <XCircle className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Link didn't work</h1>
        <p className="text-sm text-muted-foreground/80 mt-2">{reason}</p>
      </div>
      <p className="text-center text-sm text-muted-foreground pt-1">
        <Link href="/login" className="text-primary hover:underline font-medium">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
