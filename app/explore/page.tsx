import { Suspense } from "react";

import { ExplorePageClient } from "@/components/explore-page-client";

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">
          加载探索页…
        </div>
      }
    >
      <ExplorePageClient />
    </Suspense>
  );
}
