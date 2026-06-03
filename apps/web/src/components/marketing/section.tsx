import type { ReactNode } from "react";
import { Container } from "./container";

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
};

export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  className = "",
  containerClassName = "",
}: SectionProps) {
  return (
    <section id={id} className={`py-20 sm:py-24 ${className}`}>
      <Container className={containerClassName}>
        {(eyebrow || title || description) && (
          <div className="mb-12 max-w-3xl">
            {eyebrow ? (
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
            ) : null}
            {title ? <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2> : null}
            {description ? <p className="mt-4 text-balance text-base text-foreground-muted">{description}</p> : null}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}
