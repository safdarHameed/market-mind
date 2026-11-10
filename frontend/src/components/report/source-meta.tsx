import { BadgeCheck, CircleSlash, FileText, FlaskConical, TextQuote } from "lucide-react";

import { Badge } from "@/components/ui/primitives";
import type { VerificationStatus } from "@/lib/types";

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  switch (status) {
    case "verified":
      return (
        <Badge tone="success" title="Page was fetched and its text was read">
          <BadgeCheck />
          Page verified
        </Badge>
      );
    case "snippet_only":
      return (
        <Badge tone="warning" title="The page couldn't be read (blocked, paywalled or script-rendered); only the search snippet was used">
          <TextQuote />
          Snippet only
        </Badge>
      );
    case "sample":
      return (
        <Badge tone="warning" title="Illustrative sample — not a real source">
          <FlaskConical />
          Sample
        </Badge>
      );
    case "unreachable":
      return (
        <Badge tone="danger" title="Page couldn't be reached; excluded from evidence">
          <CircleSlash />
          Excluded
        </Badge>
      );
    default:
      return (
        <Badge>
          <FileText />
          Pending
        </Badge>
      );
  }
}
