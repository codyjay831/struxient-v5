export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-10">
      <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-foreground-subtle">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground-muted">
          {description}
        </p>
      ) : null}
    </header>
  );
}
