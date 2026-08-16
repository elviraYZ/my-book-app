import { BookOpen } from "lucide-react";

import { OnboardingForm } from "@/components/onboarding-form";

/** 首次 / 修改画像：无顶栏导航，避免中途跳走 */
export default function OnboardingPage() {
  return (
    <div className="min-h-full bg-[#F7F8FC]">
      <div className="flex items-center justify-center gap-2 border-b border-[#E4E4E7]/80 bg-white/80 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/25">
          <BookOpen className="size-4" aria-hidden />
        </span>
        <span className="text-sm font-bold tracking-tight text-foreground">
          游研书伴
        </span>
      </div>
      <OnboardingForm />
    </div>
  );
}
