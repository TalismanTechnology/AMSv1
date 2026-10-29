import { Skeleton } from "@/components/ui/skeleton";

// Same shape as client.tsx: header + range, KPI strip, charts, topics.
export default function AnalyticsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading analytics">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-80 rounded-full" />
      </header>
      <div className="mb-12 grid grid-cols-2 gap-8 border-y border-border py-8 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border p-5">
            <Skeleton className="mb-4 h-4 w-32" />
            <Skeleton className="h-[250px] w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="mt-14 grid gap-12 lg:grid-cols-5 lg:gap-10">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
        <div className="space-y-3 lg:col-span-3">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
