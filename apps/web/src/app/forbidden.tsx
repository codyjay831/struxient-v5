import { PlatformAccessDeniedPanel } from "@/components/platform/platform-access-denied";

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-background">
      <PlatformAccessDeniedPanel />
    </div>
  );
}
