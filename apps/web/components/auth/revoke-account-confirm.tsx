"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Paso de confirmación explícita antes de borrar una cuenta. El token ya
 * fue validado del lado servidor (ver la página), acá solo se muestra el
 * email en juego y se dispara el POST real cuando la persona confirma
 * activamente — nunca antes.
 */
export function RevokeAccountConfirm({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleRevoke() {
    setState("loading");
    try {
      const res = await fetch("/api/auth/revoke-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        setState("error");
        return;
      }

      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card/60 border border-border">
          <CheckCircle2 className="h-6 w-6 text-foreground" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Account removed</h1>
          <p className="text-sm text-muted-foreground/80 mt-2">
            The account tied to {email} has been deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card/60 border border-border">
        <AlertTriangle className="h-6 w-6 text-foreground" />
      </div>
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Remove this account?</h1>
        <p className="text-sm text-muted-foreground/80 mt-2">
          An AXIS account tied to <span className="text-foreground font-medium">{email}</span> will
          be permanently deleted. This can't be undone.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-5 space-y-3">
        <Button
          variant="outline"
          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={state === "loading"}
          onClick={handleRevoke}
        >
          {state === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Yes, remove this account
        </Button>
        {state === "error" && (
          <p className="text-sm text-destructive">
            Something went wrong. Try again in a moment.
          </p>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground pt-1">
        Didn't mean to do this?{" "}
        <Link href="/login" className="text-primary hover:underline font-medium">
          Go back
        </Link>
      </p>
    </div>
  );
}
