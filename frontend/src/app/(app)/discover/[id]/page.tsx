import { Suspense } from "react";

import { DiscoverySkeleton, DiscoveryView } from "@/components/discovery/discovery-view";

export default function DiscoveryPage() {
  return (
    <Suspense fallback={<DiscoverySkeleton />}>
      <DiscoveryView />
    </Suspense>
  );
}
