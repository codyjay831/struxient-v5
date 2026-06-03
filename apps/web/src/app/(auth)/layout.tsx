import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { GradientMesh } from "@/components/marketing/gradient-mesh";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <GradientMesh className="opacity-80" />
      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <aside className="hidden border-r border-border bg-surface/60 p-10 backdrop-blur lg:flex lg:flex-col lg:justify-between">
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Struxient
            </Link>
            <p className="mt-4 max-w-md text-balance text-base text-foreground-muted">
              Operations command for trades. Quote, activate, execute, and recover from disruptions in one system.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <Image
              src="/marketing/showcase-workstation.svg"
              alt="Struxient workstation preview"
              width={1400}
              height={900}
              className="h-auto w-full rounded-xl"
            />
          </div>
          <p className="text-sm text-foreground-muted">
            &quot;Workstation gives us a single truth source for what is blocked and what to do next.&quot;
          </p>
        </aside>
        <section className="flex items-center justify-center p-6 sm:p-10">{children}</section>
      </div>
    </div>
  );
}
