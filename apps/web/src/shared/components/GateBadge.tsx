import { gateNumberLabel } from "../lib/pipeline.ts";
import { Badge } from "../ui/Badge.tsx";

export function GateBadge({ gate }: { gate: number | null }) {
  return <Badge tone="outline">{gateNumberLabel(gate)}</Badge>;
}
