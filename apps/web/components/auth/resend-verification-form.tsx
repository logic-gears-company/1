"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({ email: z.string().email("Invalid email address") });
type FormData = z.infer<typeof schema>;

export function ResendVerificationForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.email }),
    });

    if (!res.ok) {
      sileo.error({ title: "Something went wrong. Try again shortly." });
      return;
    }

    // La respuesta del backend no distingue "cuenta existe" de "no
    // existe" (por diseño, evita filtrar qué emails están registrados),
    // así que siempre mostramos el mismo estado de éxito acá.
    setSent(true);
  }

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground text-center">
        If that account needs verification, a new link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <Input
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        {...register("email")}
      />
      {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      <Button type="submit" variant="outline" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Resend verification email
      </Button>
    </form>
  );
}
