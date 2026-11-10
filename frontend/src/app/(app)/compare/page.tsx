import type { Metadata } from "next";
import { Suspense } from "react";

import { CompareView } from "@/components/library/compare-view";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-10"><Skeleton className="h-96" /></div>}>
      <CompareView />
    </Suspense>
  );
}
