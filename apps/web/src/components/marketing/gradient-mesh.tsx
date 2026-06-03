type GradientMeshProps = {
  className?: string;
};

export function GradientMesh({ className = "" }: GradientMeshProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div
        className="mkt-float absolute -left-24 top-8 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "var(--mkt-mesh-a)" }}
      />
      <div
        className="mkt-glow absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "var(--mkt-mesh-b)" }}
      />
      <div
        className="mkt-float absolute -right-20 bottom-0 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "var(--mkt-mesh-c)" }}
      />
    </div>
  );
}
