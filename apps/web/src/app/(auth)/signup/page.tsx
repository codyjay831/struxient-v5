"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { createAccountAction } from "./signup-actions";

const signupSchema = z
  .object({
    companyName: z.string().trim().min(2, "Company name is required."),
    name: z.string().trim().min(2, "Your name is required."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      companyName: String(formData.get("companyName") ?? ""),
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    };

    const parsed = signupSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid signup details.");
      return;
    }

    startTransition(async () => {
      const result = await createAccountAction({
        companyName: parsed.data.companyName,
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const signInResult = await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        callbackUrl: "/onboarding/trade",
        redirect: false,
      });

      if (!signInResult || signInResult.error) {
        setError("Account created, but automatic sign in failed. Please sign in manually.");
        return;
      }

      window.location.assign(signInResult.url ?? "/onboarding/trade");
    });
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-elevated)]">
      <h1 className="text-2xl font-semibold tracking-tight">Create your company</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        Set up your owner account and start running jobs from one Workstation.
      </p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Company name</span>
          <input
            type="text"
            name="companyName"
            autoComplete="organization"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-border-strong"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Your name</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-border-strong"
          />
        </label>
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
            autoComplete="new-password"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-border-strong"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Confirm password</span>
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-border-strong"
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}

        <Button type="submit" variant="primary" className="w-full py-2.5 text-sm" disabled={isPending}>
          {isPending ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-foreground-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
