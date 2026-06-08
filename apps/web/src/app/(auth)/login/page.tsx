import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-elevated)]">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-foreground-muted">Loading sign-in…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
