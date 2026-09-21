import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

function ResetPasswordFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="text-center">
        <div className="mx-auto h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mx-auto mt-3 h-5 w-64 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="h-52 animate-pulse rounded-xl border border-border bg-card/40" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
