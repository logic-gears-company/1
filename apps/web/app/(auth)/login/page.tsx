import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Welcome back</h1>
        <p className="text-sm text-muted-foreground/80 mt-2">
          Your space is still here
        </p>
      </div>
      {/* LoginForm usa useSearchParams() (lee callbackUrl) — Next.js exige
          un límite de Suspense alrededor de cualquier client component que
          lo use, o el prerenderizado estático falla en build con
          "should be wrapped in a suspense boundary". */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
