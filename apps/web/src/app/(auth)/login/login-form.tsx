"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => searchParams.get("callbackUrl") ?? "/workstation", [searchParams]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    const parsed = loginSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid credentials.");
      return;
    }

    startTransition(async () => {
      const response = await signIn("credentials", {
        ...parsed.data,
        callbackUrl,
        redirect: false,
      });

      if (!response || response.error) {
        setError("Invalid email or password.");
        return;
      }

      window.location.assign(response.url ?? "/workstation");
    });
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-elevated)]">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-foreground-muted">Sign in to your workspace to continue.</p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-border-strong"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-border-strong"
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}

        <Button type="submit" variant="primary" className="w-full py-2.5 text-sm" disabled={isPending}>
          {isPending ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-foreground-muted">
        New to Struxient?{" "}
        <Link href="/signup" className="text-foreground underline-offset-4 hover:underline">
          Create your company
        </Link>
      </p>
    </div>
  );
}
