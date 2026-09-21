"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const REDIRECT_SECONDS = 3;

/**
 * Pantalla de éxito tras verificar el email, con auto-redirect a /login
 * pasados unos segundos. Es un Client Component separado (no la página en
 * sí) porque necesita useEffect/useRouter, que no corren en el Server
 * Component que decide qué estado mostrar según el query param.
 */
export function VerifySuccessRedirect() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      router.push("/login");
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, router]);

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card/60 border border-border">
        <CheckCircle2 className="h-6 w-6 text-foreground" />
      </div>
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Email confirmed</h1>
        <p className="text-sm text-muted-foreground/80 mt-2">
          Your address is verified. Redirecting to sign in in {secondsLeft}...
        </p>
      </div>
      <Button asChild className="w-full">
        <Link href="/login">Sign in now</Link>
      </Button>
    </div>
  );
}
