import { Card } from "@/shared/ui/Card.tsx";
import { Skeleton } from "@/shared/ui/Skeleton.tsx";

export function AgentCardSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-3/4" />
    </Card>
  );
}
