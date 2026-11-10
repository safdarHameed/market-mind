import type { Metadata } from "next";
import { Suspense } from "react";

import { SharedReport } from "@/components/report/shared-report";

export const metadata: Metadata = { title: "Shared opportunity report", robots: { index: false } };

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <SharedReport />
    </Suspense>
  );
}
