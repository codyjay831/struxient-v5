import { WorkstationShell } from "@/components/workstation/workstation-shell";

export default function WorkstationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl">
      <WorkstationShell />
      {children}
    </div>
  );
}
