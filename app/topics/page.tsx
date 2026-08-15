import { Suspense } from "react";

import { TopicsPageClient } from "@/components/topics-page-client";

export default async function TopicsPage() {
  return (
    <Suspense fallback={null}>
      <TopicsPageClient topics={[]} />
    </Suspense>
  );
}
