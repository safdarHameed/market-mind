import type { Metadata } from "next";
import { Suspense } from "react";

import { PrintOwnReport } from "@/components/report/print-view";

export const metadata: Metadata = { title: "Print report", robots: { index: false } };

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintOwnReport />
    </Suspense>
  );
}
