"use client";

import { NewSearchProvider } from "@/components/new-search-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <NewSearchProvider>{children}</NewSearchProvider>;
}
