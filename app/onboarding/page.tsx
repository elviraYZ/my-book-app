import { OnboardingForm } from "@/components/onboarding-form";
import { SiteHeader } from "@/components/site-header";

export default function OnboardingPage() {
  return (
    <>
      <SiteHeader variant="minimal" />
      <OnboardingForm />
    </>
  );
}
