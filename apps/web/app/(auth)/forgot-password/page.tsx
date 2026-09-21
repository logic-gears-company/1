"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sileo } from "sileo";
import { useState } from "react";

const schema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordData = z.infer<typeof schema>;

const GENERIC_MESSAGE = "If an account exists for this email, we'll send a reset link.";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: ForgotPasswordData) {
    try {
      const response = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Unable to send reset link.");
      }

      setSent(true);
    } catch (error) {
      sileo.error({
        title: "Unable to send reset link",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground/80">
          Enter your email and we&apos;ll send you a secure link to choose a new password.
        </p>
      </div>

      {sent ? (
        <div className="rounded-xl border border-border bg-card/40 p-5 text-center">
          <p className="text-sm leading-6 text-foreground">{GENERIC_MESSAGE}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Check your inbox and spam folder if you requested a reset.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card/40 p-5 transition-colors focus-within:border-primary/50">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register("email")}
                aria-invalid={errors.email ? "true" : "false"}
              />
              {errors.email && (
                <p className="text-sm text-destructive" role="alert">{errors.email.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        </div>
      )}

      <p className="pt-1 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
