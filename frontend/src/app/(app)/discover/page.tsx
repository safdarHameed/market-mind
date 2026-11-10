import type { Metadata } from "next";
import { Suspense } from "react";

import { DiscoverView } from "@/components/discover/discover-view";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverView />
    </Suspense>
  );
}
