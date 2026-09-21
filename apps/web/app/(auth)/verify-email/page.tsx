import type { Metadata } from "next";
import Link from "next/link";
import { XCircle, MailCheck } from "lucide-react";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { VerifySuccessRedirect } from "@/components/auth/verify-success-redirect";

export const metadata: Metadata = { title: "Verify your email" };

// Tres formas de llegar acá:
//  1. Sin ?status — justo después de registrarse (NextAuth pages.verifyRequest
//     también apunta acá): "revisá tu correo".
//  2. ?status=success — volviendo desde /api/auth/verify-email tras un link
//     válido. Auto-redirect a /login a los 3s (ver VerifySuccessRedirect).
//  3. ?status=error | expired — el link falló o venció; se ofrece reenvío.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; reason?: string }>;
}) {
  const { status } = await searchParams;

  if (status === "success") {
    return <VerifySuccessRedirect />;
  }

  if (status === "error" || status === "expired") {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card/60 border border-border">
          <XCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
            {status === "expired" ? "Link expired" : "Link didn't work"}
          </h1>
          <p className="text-sm text-muted-foreground/80 mt-2">
            {status === "expired"
              ? "Verification links expire after 24 hours. Request a new one below."
              : "This verification link is invalid. Request a new one below."}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-5">
          <ResendVerificationForm />
        </div>
      </div>
    );
  }

  // Estado por defecto: recién registrado, esperando que abra el correo.
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card/60 border border-border">
        <MailCheck className="h-6 w-6 text-foreground" />
      </div>
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Check your email</h1>
        <p className="text-sm text-muted-foreground/80 mt-2">
          We've sent a verification link. Click it to activate your account.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card/40 p-5">
        <p className="text-sm text-muted-foreground mb-3">Didn't get it?</p>
        <ResendVerificationForm />
      </div>
      <p className="text-center text-sm text-muted-foreground pt-1">
        <Link href="/login" className="text-primary hover:underline font-medium">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
