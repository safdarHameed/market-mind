import { Suspense } from "react";

import { ReportSkeleton, ReportView } from "@/components/report/report-view";

export default function OpportunityPage() {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportView />
    </Suspense>
  );
}
