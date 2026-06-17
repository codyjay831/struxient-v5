import { signOut } from "@/auth";
import { PlatformShellClient } from "./platform-shell-client";

export function PlatformShell({
  children,
  requestId,
}: {
  children: React.ReactNode;
  requestId?: string;
}) {
  const signOutAction = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <PlatformShellClient requestId={requestId} signOutAction={signOutAction}>
      {children}
    </PlatformShellClient>
  );
}
