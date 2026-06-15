import { getBetaSignupInvitePreview } from "@/lib/beta/beta-signup-invite";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ beta?: string }>;
}) {
  const params = await (searchParams ?? Promise.resolve({} as { beta?: string }));
  const betaToken = params.beta?.trim() || undefined;
  const preview = betaToken ? await getBetaSignupInvitePreview(betaToken) : null;

  return (
    <SignupForm
      betaToken={betaToken}
      betaPreview={
        preview
          ? {
              email: preview.normalizedEmail,
              betaDays: preview.betaDays,
              aiEnabled: preview.aiEnabled,
              aiIncludedUnits: preview.aiIncludedUnits,
              expiresAt: preview.expiresAt.toISOString(),
            }
          : null
      }
    />
  );
}
