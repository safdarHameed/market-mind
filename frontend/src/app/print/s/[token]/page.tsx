import type { Metadata } from "next";
import { Suspense } from "react";

import { PrintSharedReport } from "@/components/report/print-view";

export const metadata: Metadata = { title: "Print report", robots: { index: false } };

export default function PrintSharedPage() {
  return (
    <Suspense fallback={null}>
      <PrintSharedReport />
    </Suspense>
  );
}
