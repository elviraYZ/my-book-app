import { Suspense } from "react";

import { RecommendPageClient } from "@/components/recommend-page-client";

export default function RecommendPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-[#8B95A8]">
          加载推荐结果…
        </div>
      }
    >
      <RecommendPageClient />
    </Suspense>
  );
}
