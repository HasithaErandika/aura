import { Skeleton } from "./Skeleton.tsx";

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-4 py-4 sm:px-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
