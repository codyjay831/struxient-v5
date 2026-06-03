import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, ClipboardList, Hammer, Sparkles, TriangleAlert, Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/marketing/container";
import { GradientMesh } from "@/components/marketing/gradient-mesh";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Struxient | Construction Operations That Stay In Sync",
  description:
    "Run your trade business from one system. Close quotes, activate jobs, and keep your team aligned in the Workstation.",
  openGraph: {
    title: "Struxient",
    description: "Know what is happening on every job and what should happen next.",
    images: ["/marketing/og.svg"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/marketing/og.svg"],
  },
};

const featureCards = [
  {
    title: "Quote to Job Activation",
    description:
      "Commit scope once and activate into execution-ready job stages and tasks without rebuilding everything by hand.",
    icon: ClipboardList,
  },
  {
    title: "Workstation Command Center",
    description:
      "See overdue, blocked, and payment-sensitive work in one role-aware cockpit so supervisors and field crews act fast.",
    icon: Hammer,
  },
  {
    title: "Signal-Driven Recovery",
    description:
      "When issues hit, Struxient tracks recovery actions, dependencies, and next best tasks so jobs keep moving.",
    icon: TriangleAlert,
  },
  {
    title: "Commercial Visibility",
    description:
      "Payments, approvals, and customer commitments are always tied to the work stream, not buried in disconnected notes.",
    icon: Wallet,
  },
];

const stats = [
  { label: "Quote to task handoff", value: "Minutes" },
  { label: "Operational truth source", value: "Single" },
  { label: "Role-aware action feed", value: "Live" },
];

export default function MarketingPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border pb-20 pt-16 sm:pb-24 sm:pt-20">
        <GradientMesh />
        <Container className="relative z-10 grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <Reveal>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-[var(--mkt-glass)] px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-foreground-muted">
              <Sparkles className="size-3.5 text-accent" />
              Purpose-built for trades
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              Know what is happening on every job and what should happen next.
            </h1>
            <p className="mt-6 max-w-xl text-balance text-lg text-foreground-muted">
              Struxient unifies sales, execution, and field operations so your team can close work faster, launch cleaner
              jobs, and recover from chaos without losing margin.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/signup" variant="primary" className="px-5 py-3 text-sm">
                Get started
                <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" className="px-5 py-3 text-sm">
                Sign in
              </ButtonLink>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-surface/80 px-4 py-4 backdrop-blur">
                  <p className="text-xl font-semibold tracking-tight">{stat.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.13em] text-foreground-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.08} className="relative">
            <div className="relative rounded-2xl border border-border bg-[var(--mkt-glass)] p-2 shadow-[var(--shadow-elevated)] backdrop-blur">
              <Image
                src="/marketing/hero.svg"
                alt="Struxient hero visual with construction operations dashboard"
                width={1600}
                height={1000}
                priority
                className="h-auto w-full rounded-xl"
              />
            </div>
          </Reveal>
        </Container>
      </section>

      <Section
        id="features"
        eyebrow="Core capabilities"
        title="Everything your team needs to move from sold scope to clean execution"
        description="Designed for operations leaders who need confidence in what is blocked, what is due, and what must happen now."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {featureCards.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.05}>
              <article className="h-full rounded-2xl border border-border bg-surface p-6 shadow-soft transition-transform duration-200 hover:-translate-y-0.5">
                <feature.icon className="size-6 text-accent" />
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-foreground-muted">{feature.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        id="how-it-works"
        eyebrow="How it works"
        title="One operational spine from intake to completion"
        description="The same system that sells the work activates and governs execution."
        className="border-y border-border bg-surface/40"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Capture and close",
              description: "Leads become structured quotes with scope clarity and commitment checkpoints.",
            },
            {
              step: "02",
              title: "Activate to execution",
              description: "Approved quotes materialize into job stages and tasks with explicit dependencies.",
            },
            {
              step: "03",
              title: "Run from Workstation",
              description: "Teams execute from one attention feed with issue and payment awareness.",
            },
          ].map((item, index) => (
            <Reveal key={item.step} delay={index * 0.06}>
              <div className="rounded-2xl border border-border bg-surface p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{item.step}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-foreground-muted">{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        title="See work exactly how your team runs it"
        description="A role-aware Workstation gives office and field teams one source of operational truth."
      >
        <Reveal>
          <div className="rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-elevated)]">
            <Image
              src="/marketing/showcase-workstation.svg"
              alt="Product showcase panel for the Struxient workstation"
              width={1400}
              height={900}
              className="h-auto w-full rounded-xl"
            />
          </div>
        </Reveal>
      </Section>

      <Section id="pricing" className="pt-0">
        <Reveal>
          <div className="rounded-3xl border border-border bg-[linear-gradient(135deg,var(--mkt-hero-from),var(--mkt-hero-via),var(--mkt-hero-to))] p-8 text-accent-contrast sm:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-contrast/80">Launch pricing</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Start with one team, then scale across your crews.
            </h2>
            <p className="mt-4 max-w-2xl text-accent-contrast/85">
              Get the full quote-to-execution workflow with onboarding support. Add additional teams as your operations mature.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink
                href="/signup"
                variant="secondary"
                className="border-transparent bg-accent-contrast px-5 py-3 text-foreground hover:bg-accent-contrast/90"
              >
                Get started
              </ButtonLink>
              <ButtonLink
                href="/login"
                variant="ghost"
                className="border border-white/20 px-5 py-3 text-accent-contrast hover:bg-white/10 hover:text-accent-contrast"
              >
                Existing customer sign in
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
