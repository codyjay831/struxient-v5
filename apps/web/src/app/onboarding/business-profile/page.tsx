import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { BusinessProfileOnboardingForm } from "./profile-form";

export default async function BusinessProfileOnboardingPage() {
  const ctx = await getRequestContextOrThrow();
  const profile = await db.organizationBusinessProfile.findUnique({
    where: { organizationId: ctx.organizationId },
    select: {
      trades: true,
      workTypes: true,
      customerMarkets: true,
      operatingModel: true,
      teamSize: true,
    },
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-3xl">
        <BusinessProfileOnboardingForm
          initial={{
            trades: profile?.trades ?? [],
            workTypes: profile?.workTypes ?? [],
            customerMarkets: profile?.customerMarkets ?? [],
            operatingModel: profile?.operatingModel ?? null,
            teamSize: profile?.teamSize ?? null,
          }}
        />
      </div>
    </div>
  );
}

